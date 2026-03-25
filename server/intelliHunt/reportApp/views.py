import os
import uuid
import threading
import time
import yaml
import json
import sys
import zipfile
import shutil
import tempfile
import base64
from django.http import HttpResponse, FileResponse
from django.conf import settings
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
import subprocess
from django.views.decorators.http import require_http_methods
from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from django.core.files.storage import default_storage
from django.core.files.base import ContentFile

import logging

from .auth import require_auth, tenant_path
from .logging_utils import log_action, create_scan_result, complete_scan_result

logger = logging.getLogger("intelliHunt")

# ── CMDB Integration Helpers ──────────────────────────────────────────────────
_SENSITIVE = {'password', 'api_token', 'token', 'api_key', 'client_secret'}


def _load_cmdb_integrations(org_id: str):
    path = tenant_path(org_id, 'cmdb_integrations.json')
    try:
        with open(path, 'r') as f:
            return json.load(f)
    except FileNotFoundError:
        return {}
    except Exception:
        return {}


def _save_cmdb_integrations(data, org_id: str):
    path = tenant_path(org_id, 'cmdb_integrations.json')
    with open(path, 'w') as f:
        json.dump(data, f, indent=2)


def _mask_sensitive(cfg):
    return {k: ('***' if k in _SENSITIVE and v else v) for k, v in cfg.items()}


def _os_entries_from_records(records, os_field_names):
    """Generic helper: extract OS entries from a list of dicts."""
    os_map = {}
    for rec in records:
        if not isinstance(rec, dict):
            continue
        os_name = ''
        for fname in os_field_names:
            raw = rec.get(fname)
            if isinstance(raw, dict):
                raw = raw.get('display_value', raw.get('value', ''))
            if raw:
                os_name = str(raw).strip().lower()
                break
        if not os_name:
            continue
        if 'windows' in os_name:
            vendor = 'microsoft'
        elif any(x in os_name for x in ['linux', 'ubuntu', 'centos', 'debian', 'rhel', 'fedora', 'suse']):
            vendor = 'linux'
        elif 'macos' in os_name or 'mac os' in os_name:
            vendor = 'apple'
        else:
            vendor = 'unknown'
        product = os_name.replace(' ', '_').replace('/', '_')
        os_map.setdefault(vendor, set()).add(product)
    return [{'vendor': v, 'products': [{'name': p} for p in sorted(ps)]} for v, ps in os_map.items()]


_CS_CLOUD_HOSTS = {
    'us-1':     'api.crowdstrike.com',
    'us-2':     'api.us-2.crowdstrike.com',
    'eu-1':     'api.eu-1.crowdstrike.com',
    'us-gov-1': 'api.laggar.gcw.crowdstrike.com',
}


def _cs_base(cfg):
    return 'https://' + _CS_CLOUD_HOSTS.get(cfg.get('cloud', 'us-1'), 'api.crowdstrike.com')


def _cs_token(rq, cfg):
    """Exchange CrowdStrike client credentials for an access token."""
    r = rq.post(
        _cs_base(cfg) + '/oauth2/token',
        data={'client_id': cfg.get('client_id', ''), 'client_secret': cfg.get('client_secret', '')},
        headers={'Content-Type': 'application/x-www-form-urlencoded'},
        timeout=15,
    )
    return r


def _s1_headers(cfg):
    return {'Authorization': f"ApiToken {cfg.get('api_token', '')}", 'Accept': 'application/json'}


def _defender_token(rq, cfg):
    """Exchange Defender (Azure AD) client credentials for an access token."""
    r = rq.post(
        f"https://login.microsoftonline.com/{cfg.get('tenant_id', '')}/oauth2/token",
        data={
            'grant_type': 'client_credentials',
            'client_id': cfg.get('client_id', ''),
            'client_secret': cfg.get('client_secret', ''),
            'resource': 'https://api.securitycenter.microsoft.com',
        },
        timeout=15,
    )
    return r


def _app_entries_from_software(records, vendor_field, product_field):
    """Build application entries from a flat list of software records."""
    from collections import defaultdict
    vendor_products = defaultdict(set)
    for rec in records:
        if not isinstance(rec, dict):
            continue
        vendor = str(rec.get(vendor_field) or 'unknown').strip().lower()
        product = str(rec.get(product_field) or '').strip().lower()
        if not product:
            continue
        vendor_clean = vendor.replace(' ', '_').replace(',', '').replace('.', '').replace('/', '_') or 'unknown'
        product_clean = product.replace(' ', '_').replace(',', '').replace('.', '').replace('/', '_')
        vendor_products[vendor_clean].add(product_clean)
    # Cap to 100 vendors; sort for determinism
    return [
        {'vendor': v, 'products': sorted(ps)[:100]}
        for v, ps in sorted(vendor_products.items())[:100]
    ]


# ── CMDB Integration Views ────────────────────────────────────────────────────

@csrf_exempt
@require_auth
def cmdb_integrations(request):
    """GET: list saved integrations (masked). POST: save/update one."""
    if request.method == 'GET':
        configs = _load_cmdb_integrations(request.org_id)
        return JsonResponse({'integrations': {k: _mask_sensitive(v) for k, v in configs.items()}})

    if request.method == 'POST':
        body = json.loads(request.body)
        integration_id = body.get('id')
        new_cfg = body.get('config', {})
        if not integration_id:
            return JsonResponse({'error': 'Missing id'}, status=400)

        configs = _load_cmdb_integrations(request.org_id)
        existing = configs.get(integration_id, {})
        # Preserve existing secrets when the UI sends back masked '***'
        for field in _SENSITIVE:
            if new_cfg.get(field) == '***' and existing.get(field):
                new_cfg[field] = existing[field]

        configs[integration_id] = new_cfg
        _save_cmdb_integrations(configs, request.org_id)
        return JsonResponse({'message': 'Integration saved', 'id': integration_id})

    return JsonResponse({'error': 'Method not allowed'}, status=405)


@csrf_exempt
@require_auth
def delete_cmdb_integration(request, integration_id):
    if request.method == 'DELETE':
        configs = _load_cmdb_integrations(request.org_id)
        if integration_id not in configs:
            return JsonResponse({'error': 'Not found'}, status=404)
        del configs[integration_id]
        _save_cmdb_integrations(configs, request.org_id)
        return JsonResponse({'message': 'Integration deleted'})
    return JsonResponse({'error': 'Method not allowed'}, status=405)


@csrf_exempt
@require_auth
def test_cmdb_connection(request):
    if request.method != 'POST':
        return JsonResponse({'error': 'POST required'}, status=405)

    body = json.loads(request.body)
    itype = body.get('type')
    cfg = body.get('config', {})

    try:
        import requests as rq

        if itype == 'servicenow':
            url = (f"https://{cfg.get('instance', '').strip()}.service-now.com"
                   f"/api/now/table/{cfg.get('table', 'cmdb_ci_computer')}"
                   f"?sysparm_limit=1&sysparm_fields=sys_id")
            r = rq.get(url, auth=(cfg.get('username', ''), cfg.get('password', '')), timeout=15)
            if r.status_code == 200:
                return JsonResponse({'status': 'connected', 'message': 'Connected to ServiceNow CMDB'})
            if r.status_code == 401:
                return JsonResponse({'status': 'error', 'message': 'Authentication failed — check credentials'})
            return JsonResponse({'status': 'error', 'message': f'HTTP {r.status_code}'})

        elif itype == 'bmc_helix':
            server = cfg.get('server', '').rstrip('/')
            r = rq.post(
                f"{server}/api/jwt/login",
                json={'username': cfg.get('username', ''), 'password': cfg.get('password', '')},
                timeout=15, verify=False,
            )
            if r.status_code == 200:
                return JsonResponse({'status': 'connected', 'message': 'Connected to BMC Helix CMDB'})
            if r.status_code == 401:
                return JsonResponse({'status': 'error', 'message': 'Authentication failed — check credentials'})
            return JsonResponse({'status': 'error', 'message': f'HTTP {r.status_code}'})

        elif itype == 'atlassian':
            auth_str = base64.b64encode(
                f"{cfg.get('email', '')}:{cfg.get('api_token', '')}".encode()
            ).decode()
            url = (f"https://api.atlassian.com/jsm/assets/workspace"
                   f"/{cfg.get('workspace_id', '')}/v1/objectschema/list")
            r = rq.get(url, headers={'Authorization': f'Basic {auth_str}', 'Accept': 'application/json'}, timeout=15)
            if r.status_code == 200:
                return JsonResponse({'status': 'connected', 'message': 'Connected to Atlassian Assets'})
            if r.status_code == 401:
                return JsonResponse({'status': 'error', 'message': 'Authentication failed — check email/API token'})
            if r.status_code == 404:
                return JsonResponse({'status': 'error', 'message': 'Workspace not found — check workspace ID'})
            return JsonResponse({'status': 'error', 'message': f'HTTP {r.status_code}'})

        elif itype == 'custom':
            endpoint = cfg.get('endpoint', '').strip()
            auth_type = cfg.get('auth_type', 'none')
            headers, auth = {}, None
            if auth_type == 'basic':
                auth = (cfg.get('username', ''), cfg.get('password', ''))
            elif auth_type == 'bearer':
                headers['Authorization'] = f"Bearer {cfg.get('token', '')}"
            elif auth_type == 'api_key':
                headers[cfg.get('key_header', 'X-API-Key')] = cfg.get('api_key', '')
            r = rq.get(endpoint, auth=auth, headers=headers, timeout=15)
            if r.status_code < 400:
                return JsonResponse({'status': 'connected', 'message': f'Connected (HTTP {r.status_code})'})
            return JsonResponse({'status': 'error', 'message': f'HTTP {r.status_code}'})

        elif itype == 'crowdstrike':
            tok_r = _cs_token(rq, cfg)
            if tok_r.status_code == 201:
                return JsonResponse({'status': 'connected', 'message': 'Connected to CrowdStrike Falcon'})
            if tok_r.status_code == 401:
                return JsonResponse({'status': 'error', 'message': 'Invalid client ID or secret'})
            if tok_r.status_code == 400:
                return JsonResponse({'status': 'error', 'message': 'Bad request — check client ID format'})
            return JsonResponse({'status': 'error', 'message': f'HTTP {tok_r.status_code}'})

        elif itype == 'sentinelone':
            base = cfg.get('base_url', '').rstrip('/')
            if not base:
                return JsonResponse({'status': 'error', 'message': 'Base URL is required'})
            r = rq.get(
                f"{base}/web/api/v2.1/system/status",
                headers=_s1_headers(cfg),
                timeout=15,
            )
            if r.status_code == 200:
                return JsonResponse({'status': 'connected', 'message': 'Connected to SentinelOne'})
            if r.status_code in (401, 403):
                return JsonResponse({'status': 'error', 'message': 'Invalid API token'})
            return JsonResponse({'status': 'error', 'message': f'HTTP {r.status_code}'})

        elif itype == 'defender':
            tok_r = _defender_token(rq, cfg)
            if tok_r.status_code == 200 and tok_r.json().get('access_token'):
                return JsonResponse({'status': 'connected', 'message': 'Connected to Microsoft Defender for Endpoint'})
            err = ''
            try:
                err = tok_r.json().get('error_description', '')[:80]
            except Exception:
                pass
            if tok_r.status_code in (400, 401):
                return JsonResponse({'status': 'error', 'message': err or 'Authentication failed — check tenant/client credentials'})
            return JsonResponse({'status': 'error', 'message': f'HTTP {tok_r.status_code}'})

        return JsonResponse({'status': 'error', 'message': 'Unknown integration type'}, status=400)

    except Exception as ex:
        import requests.exceptions as rqex
        if isinstance(ex, rqex.ConnectionError):
            return JsonResponse({'status': 'error', 'message': 'Connection refused — verify host/URL'})
        if isinstance(ex, rqex.Timeout):
            return JsonResponse({'status': 'error', 'message': 'Connection timed out (15 s)'})
        return JsonResponse({'status': 'error', 'message': f'Error: {str(ex)}'})


@csrf_exempt
@require_auth
def import_cmdb_data(request):
    """Pull CI records from a CMDB and write to organization_cmdb.yaml."""
    if request.method != 'POST':
        return JsonResponse({'error': 'POST required'}, status=405)

    body = json.loads(request.body)
    integration_id = body.get('id')
    itype = body.get('type')

    configs = _load_cmdb_integrations(request.org_id)
    if integration_id not in configs:
        return JsonResponse({'error': 'Integration not found'}, status=404)
    cfg = configs[integration_id]

    try:
        import requests as rq

        os_entries = []
        app_entries = []

        if itype == 'servicenow':
            table = cfg.get('table', 'cmdb_ci_computer')
            url = (f"https://{cfg.get('instance', '').strip()}.service-now.com"
                   f"/api/now/table/{table}"
                   f"?sysparm_limit=500&sysparm_fields=name,os,os_version,manufacturer,model_id")
            r = rq.get(url, auth=(cfg.get('username', ''), cfg.get('password', '')), timeout=30)
            if r.status_code != 200:
                return JsonResponse({'error': f'Import failed: HTTP {r.status_code}'}, status=400)
            os_entries = _os_entries_from_records(
                r.json().get('result', []), ['os', 'operating_system', 'name']
            )

        elif itype == 'bmc_helix':
            server = cfg.get('server', '').rstrip('/')
            tok_r = rq.post(
                f"{server}/api/jwt/login",
                json={'username': cfg.get('username', ''), 'password': cfg.get('password', '')},
                timeout=15, verify=False,
            )
            if tok_r.status_code != 200:
                return JsonResponse({'error': f'Auth failed: HTTP {tok_r.status_code}'}, status=400)
            token = tok_r.text.strip().strip('"')
            r = rq.get(
                f"{server}/api/arsys/v1/entry/AST:ComputerSystem"
                f"?fields=values(Name,OS,OSVersion,Manufacturer,Model)&limit=500",
                headers={'Authorization': f'AR-JWT {token}'},
                timeout=30, verify=False,
            )
            if r.status_code != 200:
                return JsonResponse({'error': f'Import failed: HTTP {r.status_code}'}, status=400)
            records = [e.get('values', {}) for e in r.json().get('entries', [])]
            os_entries = _os_entries_from_records(records, ['OS', 'os', 'OperatingSystem'])

        elif itype == 'atlassian':
            auth_str = base64.b64encode(
                f"{cfg.get('email', '')}:{cfg.get('api_token', '')}".encode()
            ).decode()
            hdrs = {'Authorization': f'Basic {auth_str}', 'Accept': 'application/json',
                    'Content-Type': 'application/json'}
            workspace_id = cfg.get('workspace_id', '')
            r = rq.post(
                f"https://api.atlassian.com/jsm/assets/workspace/{workspace_id}/v1/object/aql",
                headers=hdrs,
                json={'qlQuery': 'objectType in ("Computer","Server","Hardware")', 'maxResults': 500},
                timeout=30,
            )
            if r.status_code != 200:
                return JsonResponse({'error': f'Import failed: HTTP {r.status_code}'}, status=400)
            flattened = []
            for obj in r.json().get('values', []):
                flat = {}
                for attr in obj.get('attributes', []):
                    vals = attr.get('objectAttributeValues', [])
                    name = attr.get('objectTypeAttribute', {}).get('name', '')
                    if vals and name:
                        flat[name.lower()] = vals[0].get('displayValue', '')
                flattened.append(flat)
            os_entries = _os_entries_from_records(flattened, ['os', 'operating system', 'platform'])

        elif itype == 'custom':
            endpoint = cfg.get('endpoint', '').strip()
            auth_type = cfg.get('auth_type', 'none')
            headers, auth = {}, None
            if auth_type == 'basic':
                auth = (cfg.get('username', ''), cfg.get('password', ''))
            elif auth_type == 'bearer':
                headers['Authorization'] = f"Bearer {cfg.get('token', '')}"
            elif auth_type == 'api_key':
                headers[cfg.get('key_header', 'X-API-Key')] = cfg.get('api_key', '')
            r = rq.get(endpoint, auth=auth, headers=headers, timeout=30)
            if r.status_code >= 400:
                return JsonResponse({'error': f'Import failed: HTTP {r.status_code}'}, status=400)
            raw = r.json()
            if isinstance(raw, dict):
                records = raw.get('result', raw.get('records', raw.get('data', raw.get('items', []))))
            else:
                records = raw if isinstance(raw, list) else []
            os_entries = _os_entries_from_records(
                records, ['os', 'OS', 'operating_system', 'OperatingSystem', 'platform']
            )

        elif itype == 'crowdstrike':
            base = _cs_base(cfg)
            # 1. Authenticate
            tok_r = _cs_token(rq, cfg)
            if tok_r.status_code != 201:
                return JsonResponse({'error': f'CrowdStrike auth failed: HTTP {tok_r.status_code}'}, status=400)
            access_token = tok_r.json().get('access_token', '')
            hdrs = {'Authorization': f'Bearer {access_token}', 'Accept': 'application/json'}

            # 2. Query device IDs (up to 500)
            dev_ids_r = rq.get(
                f"{base}/devices/queries/devices/v1?limit=500",
                headers=hdrs, timeout=30,
            )
            device_ids = dev_ids_r.json().get('resources', [])[:100]

            # 3. Fetch device details for OS info
            if device_ids:
                dev_r = rq.post(
                    f"{base}/devices/entities/devices/v2",
                    headers=hdrs, json={'ids': device_ids}, timeout=30,
                )
                devices = dev_r.json().get('resources', [])
                os_entries = _os_entries_from_records(
                    devices, ['os_version', 'platform_name', 'os_product_name', 'platform']
                )
            else:
                os_entries = []

            # 4. Fetch installed applications from Falcon Discover (if available)
            app_ids_r = rq.get(
                f"{base}/discover/queries/applications/v1?limit=500",
                headers=hdrs, timeout=30,
            )
            app_ids = app_ids_r.json().get('resources', [])[:500]
            if app_ids:
                app_detail_r = rq.post(
                    f"{base}/discover/entities/applications/v1",
                    headers=hdrs, json={'ids': app_ids}, timeout=30,
                )
                app_records = app_detail_r.json().get('resources', [])
                app_entries = _app_entries_from_software(app_records, 'vendor', 'name')

        elif itype == 'sentinelone':
            base = cfg.get('base_url', '').rstrip('/')
            if not base:
                return JsonResponse({'error': 'Base URL is required'}, status=400)
            hdrs = _s1_headers(cfg)

            # 1. Fetch agents with OS info (paginate up to 500 agents)
            agents_r = rq.get(
                f"{base}/web/api/v2.1/agents?limit=100&isActive=true",
                headers=hdrs, timeout=30,
            )
            if agents_r.status_code != 200:
                return JsonResponse({'error': f'Failed to fetch agents: HTTP {agents_r.status_code}'}, status=400)
            agents = agents_r.json().get('data', [])
            os_entries = _os_entries_from_records(agents, ['osName', 'osType', 'operatingSystem'])

            # 2. Fetch installed applications
            apps_r = rq.get(
                f"{base}/web/api/v2.1/installed-applications?limit=1000",
                headers=hdrs, timeout=30,
            )
            if apps_r.status_code == 200:
                app_records = apps_r.json().get('data', [])
                app_entries = _app_entries_from_software(app_records, 'publisher', 'name')

        elif itype == 'defender':
            # 1. Authenticate with Azure AD
            tok_r = _defender_token(rq, cfg)
            if tok_r.status_code != 200:
                return JsonResponse({'error': f'Defender auth failed: HTTP {tok_r.status_code}'}, status=400)
            access_token = tok_r.json().get('access_token', '')
            hdrs = {
                'Authorization': f'Bearer {access_token}',
                'Accept': 'application/json',
            }
            mde_base = 'https://api.securitycenter.microsoft.com/api'

            # 2. Fetch machines for OS info (top 500)
            machines_r = rq.get(
                f"{mde_base}/machines?$top=500&$select=id,computerDnsName,osPlatform,osVersion",
                headers=hdrs, timeout=30,
            )
            if machines_r.status_code != 200:
                return JsonResponse({'error': f'Failed to fetch machines: HTTP {machines_r.status_code}'}, status=400)
            machines = machines_r.json().get('value', [])
            os_entries = _os_entries_from_records(machines, ['osPlatform', 'osVersion'])

            # 3. Fetch software inventory (top 1000 unique software titles)
            software_r = rq.get(
                f"{mde_base}/software?$top=1000",
                headers=hdrs, timeout=30,
            )
            if software_r.status_code == 200:
                software = software_r.json().get('value', [])
                app_entries = _app_entries_from_software(software, 'vendor', 'name')

        else:
            return JsonResponse({'error': 'Unknown integration type'}, status=400)

        # Build and write YAML config
        yaml_config = {
            'organization': {
                'name': f"Imported from {itype}",
                'description': f"Auto-imported via IntelliHunt {itype} integration",
            },
            'software_stack': {
                'operating_systems': os_entries or [{'vendor': 'unknown', 'products': [{'name': 'unknown'}]}],
                'applications': app_entries,
                'cloud_platforms': [],
            },
        }
        config_path = tenant_path(request.org_id, 'organization_cmdb.yaml')
        with open(config_path, 'w') as f:
            yaml.dump(yaml_config, f, default_flow_style=False, sort_keys=False)

        # Record last-synced time
        configs[integration_id]['last_synced'] = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
        _save_cmdb_integrations(configs, request.org_id)

        os_count = sum(len(e.get('products', [])) for e in os_entries)
        app_count = sum(len(e.get('products', [])) for e in app_entries)
        parts = [f"{os_count} OS variant(s) across {len(os_entries)} vendor(s)"]
        if app_count:
            parts.append(f"{app_count} application(s) across {len(app_entries)} vendor(s)")
        log_action(request.org_id, request.user_id, request.username,
                   "cmdb_import", "completed", detail=f"id={integration_id} type={itype}")
        return JsonResponse({
            'message': f"Imported " + " and ".join(parts),
            'os_count': len(os_entries),
            'app_count': len(app_entries),
        })

    except Exception as ex:
        log_action(request.org_id, request.user_id, request.username,
                   "cmdb_import", "error", detail=str(ex)[:500])
        return JsonResponse({'error': f'Import failed: {str(ex)}'}, status=500)
# Import the repo scanner
vulnscan_path = os.path.join(settings.BASE_DIR, 'vulnScan')
if vulnscan_path not in sys.path:
    sys.path.insert(0, vulnscan_path)
from repoScanner import run_pipeline
# You might need to import your report generation logic here

# In-memory storage for task status (in production, use Redis or database)
task_status = {}

def get_task_status_file_path(task_id):
    """Get the file path for storing task status"""
    import tempfile
    import os
    temp_dir = tempfile.gettempdir()
    return os.path.join(temp_dir, f"task_status_{task_id}.json")

def save_task_status(task_id, status_data):
    """Save task status to a file for persistence"""
    try:
        import json
        file_path = get_task_status_file_path(task_id)
        with open(file_path, 'w') as f:
            json.dump(status_data, f, indent=2)
    except Exception as e:
        print(f"Error saving task status: {e}")

def load_task_status(task_id):
    """Load task status from file"""
    try:
        import json
        file_path = get_task_status_file_path(task_id)
        if os.path.exists(file_path):
            with open(file_path, 'r') as f:
                return json.load(f)
    except Exception as e:
        print(f"Error loading task status: {e}")
    return None

def cleanup_task_status(task_id):
    """Clean up task status file"""
    try:
        file_path = get_task_status_file_path(task_id)
        if os.path.exists(file_path):
            os.unlink(file_path)
    except Exception as e:
        print(f"Error cleaning up task status: {e}")

def cleanup_old_task_status_files():
    """Clean up old task status files (older than 1 hour)"""
    try:
        import tempfile
        import glob
        import time
        
        temp_dir = tempfile.gettempdir()
        pattern = os.path.join(temp_dir, "task_status_*.json")
        current_time = time.time()
        
        for file_path in glob.glob(pattern):
            try:
                # Check if file is older than 1 hour
                if current_time - os.path.getmtime(file_path) > 3600:
                    os.unlink(file_path)
                    print(f"Cleaned up old task status file: {file_path}")
            except Exception as e:
                print(f"Error cleaning up file {file_path}: {e}")
    except Exception as e:
        print(f"Error in cleanup_old_task_status_files: {e}")

# Clean up old files on module import
cleanup_old_task_status_files()

def get_yaml_template(request):
    """Serve the YAML template file for download"""
    template_path = os.path.join(settings.BASE_DIR, 'intelliHunt/crew/NVD/config/organization_cmdb_template.yaml')
    
    try:
        with open(template_path, 'rb') as f:
            response = HttpResponse(f.read(), content_type='application/x-yaml')
            response['Content-Disposition'] = 'attachment; filename="organization_cmdb_template.yaml"'
            return response
    except FileNotFoundError:
        return JsonResponse({'error': 'Template file not found'}, status=404)

@csrf_exempt
@require_auth
def upload_yaml_config(request):
    """Handle YAML configuration file upload"""
    if request.method == 'POST':
        try:
            if 'yaml_file' not in request.FILES:
                return JsonResponse({'error': 'No YAML file provided'}, status=400)

            yaml_file = request.FILES['yaml_file']

            # Validate YAML file
            try:
                yaml_content = yaml_file.read().decode('utf-8')
                yaml_data = yaml.safe_load(yaml_content)

                # Basic validation of required fields
                if 'software_stack' not in yaml_data:
                    return JsonResponse({'error': 'Invalid YAML: missing software_stack section'}, status=400)

                # Save to tenant-specific path
                config_path = tenant_path(request.org_id, 'organization_cmdb.yaml')
                with open(config_path, 'w') as f:
                    f.write(yaml_content)

                log_action(request.org_id, request.user_id, request.username,
                           "yaml_upload", "completed", detail=yaml_file.name)
                return JsonResponse({
                    'message': 'YAML configuration uploaded successfully',
                    'config': yaml_data
                })

            except yaml.YAMLError as e:
                return JsonResponse({'error': f'Invalid YAML format: {str(e)}'}, status=400)
            except Exception as e:
                return JsonResponse({'error': f'Error processing YAML file: {str(e)}'}, status=500)

        except Exception as e:
            return JsonResponse({'error': f'Upload failed: {str(e)}'}, status=500)

    return JsonResponse({'error': 'Invalid request method'}, status=405)

@require_auth
def get_current_yaml_config(request):
    """Get the current YAML configuration"""
    config_path = tenant_path(request.org_id, 'organization_cmdb.yaml')

    try:
        with open(config_path, 'r') as f:
            yaml_content = f.read()
            yaml_data = yaml.safe_load(yaml_content)

        return JsonResponse({
            'config': yaml_data,
            'raw_content': yaml_content
        })
    except FileNotFoundError:
        return JsonResponse({'error': 'Configuration file not found'}, status=404)
    except Exception as e:
        return JsonResponse({'error': f'Error reading configuration: {str(e)}'}, status=500)

def _extract_json_objects(text: str) -> list:
    """Extract all top-level JSON objects/arrays from arbitrary text."""
    objects = []
    decoder = json.JSONDecoder()
    i = 0
    while i < len(text):
        if text[i] in ('{', '['):
            try:
                obj, end = decoder.raw_decode(text, i)
                if isinstance(obj, list):
                    objects.extend([o for o in obj if isinstance(o, dict)])
                elif isinstance(obj, dict):
                    objects.append(obj)
                i = end
            except json.JSONDecodeError:
                i += 1
        else:
            i += 1
    return objects


def _detections_to_markdown(detections: list) -> str:
    """Convert a list of detection dicts to a unified markdown report string."""
    lines = [
        "# Security Threat Detection Report",
        "",
        f"**Generated:** {time.strftime('%Y-%m-%d %H:%M:%S UTC', time.gmtime())}  ",
        f"**Total Detections:** {len(detections)}",
        "",
        "---",
        "",
    ]

    for i, det in enumerate(detections, 1):
        title = det.get('detection_method', f'Detection #{i}')
        lines.append(f"## {i}. {title}")
        lines.append("")

        if det.get('description'):
            lines.append(det['description'])
            lines.append("")

        meta = []
        if det.get('detection_type'):
            meta.append(f"**Detection Type:** {det['detection_type']}")
        if det.get('confidence_level'):
            meta.append(f"**Confidence Level:** {det['confidence_level']}")
        if det.get('false_positive_risk'):
            meta.append(f"**False Positive Risk:** {det['false_positive_risk']}")
        for m in meta:
            lines.append(m + "  ")
        if meta:
            lines.append("")

        env = det.get('detection_environment', {})
        if env:
            lines.append("### Detection Environment")
            lines.append("")
            if env.get('available_sourcetypes'):
                lines.append("**Available Source Types:**")
                for s in env['available_sourcetypes']:
                    lines.append(f"- `{s}`")
                lines.append("")
            if env.get('existing_rules'):
                lines.append("**Existing Rules:**")
                for r in env['existing_rules']:
                    lines.append(f"- {r}")
                lines.append("")
            if env.get('log_retention'):
                lines.append(f"**Log Retention:** {env['log_retention']}  ")
                lines.append("")
            if env.get('siem_capabilities'):
                lines.append("**SIEM Capabilities:**")
                for c in env['siem_capabilities']:
                    lines.append(f"- {c}")
                lines.append("")

        indicators = det.get('threat_indicators', {})
        if indicators:
            lines.append("### Threat Indicators")
            lines.append("")
            for key, label in [
                ('network_indicators', 'Network Indicators'),
                ('host_indicators', 'Host Indicators'),
                ('behavioral_indicators', 'Behavioral Indicators'),
                ('temporal_indicators', 'Temporal Indicators'),
            ]:
                items = indicators.get(key, [])
                if items:
                    lines.append(f"**{label}:**")
                    for item in items:
                        lines.append(f"- {item}")
                    lines.append("")

        urls = det.get('urlList', [])
        if urls:
            lines.append("### References")
            lines.append("")
            for url in urls:
                lines.append(f"- [{url}]({url})")
            lines.append("")

        testing = det.get('testing_instructions', [])
        if testing:
            lines.append("### Testing Instructions")
            lines.append("")
            for j, step in enumerate(testing, 1):
                lines.append(f"{j}. {step}")
            lines.append("")

        if det.get('maintenance_notes'):
            lines.append("### Maintenance Notes")
            lines.append("")
            lines.append(det['maintenance_notes'])
            lines.append("")

        lines.append("---")
        lines.append("")

    return "\n".join(lines)


def generate_scan_report_markdown(raw_result) -> str:
    """Parse raw crew output (JSON or text) and return a unified markdown report."""
    if not raw_result:
        return "# Scan Results\n\n*No output was produced by the scan.*"

    text = raw_result if isinstance(raw_result, str) else str(raw_result)
    detections = []

    # Try direct parse first
    try:
        parsed = json.loads(text)
        if isinstance(parsed, list):
            detections = [d for d in parsed if isinstance(d, dict)]
        elif isinstance(parsed, dict):
            detections = [parsed]
    except (json.JSONDecodeError, TypeError):
        detections = _extract_json_objects(text)

    if not detections:
        return f"# Scan Results\n\n{text}"

    return _detections_to_markdown(detections)


def run_report_async(task_id, payload_file_path, org_id, user_id=None, username=""):
    """Run the report generation in a separate thread"""
    start_time = time.time()

    try:
        # Initialize task status with logs list
        status_data = {
            'status': 'running',
            'progress': 0,
            'message': 'Starting report generation...',
            'start_time': start_time,
            'logs': []
        }
        task_status[task_id] = status_data
        save_task_status(task_id, status_data)

        # Update progress
        status_data['progress'] = 10
        status_data['message'] = 'Loading CPE data...'
        status_data['logs'].append('[system] Loading CPE data...')
        task_status[task_id] = status_data
        save_task_status(task_id, status_data)

        # The full path to your script
        script_path = 'intelliHunt/crew/system.py'

        # Update progress
        status_data['progress'] = 20
        status_data['message'] = 'Running vulnerability analysis...'
        status_data['logs'].append('[system] Running vulnerability analysis...')
        task_status[task_id] = status_data
        save_task_status(task_id, status_data)

        # Use Popen to stream stdout/stderr line-by-line into logs
        # stdin=DEVNULL prevents CrewAI's interactive "view execution traces?"
        # prompt from blocking or raising EOFError and crashing the subprocess.
        process = subprocess.Popen(
            ['python', '-u', script_path, payload_file_path],
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            stdin=subprocess.DEVNULL,
            text=True,
            bufsize=1
        )

        full_output = []
        deadline = time.time() + 900  # 15-minute timeout
        _log_flush_counter = 0

        for line in process.stdout:
            line = line.rstrip('\n')
            full_output.append(line)
            status_data['logs'].append(line)
            task_status[task_id] = status_data

            # Batch disk writes — flush every 10 lines instead of every line
            _log_flush_counter += 1
            if _log_flush_counter % 10 == 0:
                save_task_status(task_id, status_data)

            if time.time() > deadline:
                process.kill()
                raise subprocess.TimeoutExpired(cmd=script_path, timeout=900)

        process.wait()

        if process.returncode != 0:
            raise subprocess.CalledProcessError(
                process.returncode, script_path,
                output='\n'.join(full_output),
                stderr='\n'.join(full_output)
            )

        # Update progress
        status_data['progress'] = 90
        status_data['message'] = 'Generating final report...'
        status_data['logs'].append('[system] Generating final report...')
        task_status[task_id] = status_data
        save_task_status(task_id, status_data)

        # Read the generated report markdown and persist it to the tenant directory
        report_markdown = ""
        global_report_path = os.path.join(settings.BASE_DIR, 'intelliHunt/crew/crew_report.md')
        try:
            with open(global_report_path, 'r', encoding='utf-8') as f:
                report_markdown = f.read()
            # Write to per-tenant path so get_markdown_content serves the right report
            with open(tenant_path(org_id, 'crew_report.md'), 'w', encoding='utf-8') as f:
                f.write(report_markdown)
        except Exception as e:
            print(f"Warning: Could not read/copy report file: {e}")

        # Mark as completed
        end_time = time.time()
        duration_ms = int((end_time - start_time) * 1000)
        status_data = {
            'status': 'completed',
            'progress': 100,
            'message': 'Report generation completed successfully!',
            'output': '\n'.join(full_output),
            'logs': status_data['logs'] + ['[system] Report generation completed successfully!'],
            'report_markdown': report_markdown,
            'end_time': end_time,
            'duration': end_time - start_time
        }
        task_status[task_id] = status_data
        save_task_status(task_id, status_data)
        log_action(org_id, user_id, username, "report_run", "completed",
                   detail=f"task={task_id}", duration_ms=duration_ms)

        # Broadcast update via WebSocket
        try:
            channel_layer = get_channel_layer()
            if channel_layer:
                async_to_sync(channel_layer.group_send)(
                    "report_updates",
                    {
                        "type": "report_update_message",
                        "message": "Report generation completed.",
                        "action": "content_updated"
                    }
                )
        except Exception as e:
            print(f"WebSocket broadcast failed (non-critical): {e}")

        # Clean up the temporary file
        if os.path.exists(payload_file_path):
            os.unlink(payload_file_path)

        # Schedule cleanup of task status file after 5 minutes
        import threading
        def delayed_cleanup():
            time.sleep(300)  # 5 minutes
            cleanup_task_status(task_id)

        cleanup_thread = threading.Thread(target=delayed_cleanup)
        cleanup_thread.daemon = True
        cleanup_thread.start()

    except subprocess.TimeoutExpired:
        end_time = time.time()
        status_data = {
            'status': 'error',
            'progress': 0,
            'message': 'Report generation timed out after 15 minutes. Try reducing the software stack size.',
            'logs': status_data.get('logs', []) + ['[error] Report generation timed out after 15 minutes.'],
            'end_time': end_time
        }
        task_status[task_id] = status_data
        save_task_status(task_id, status_data)
        log_action(org_id, user_id, username, "report_run", "error",
                   detail=f"task={task_id} timeout")

        # Clean up the temporary file
        if os.path.exists(payload_file_path):
            os.unlink(payload_file_path)

        def delayed_cleanup():
            time.sleep(300)
            cleanup_task_status(task_id)

        cleanup_thread = threading.Thread(target=delayed_cleanup)
        cleanup_thread.daemon = True
        cleanup_thread.start()

    except subprocess.CalledProcessError as e:
        end_time = time.time()
        error_output = e.stderr or e.output or str(e)
        status_data = {
            'status': 'error',
            'progress': 0,
            'message': f'Script failed with error: {error_output}',
            'logs': status_data.get('logs', []) + [f'[error] {error_output}'],
            'end_time': end_time
        }
        task_status[task_id] = status_data
        save_task_status(task_id, status_data)
        log_action(org_id, user_id, username, "report_run", "error",
                   detail=f"task={task_id} script_error")

        # Schedule cleanup of task status file after 5 minutes
        import threading
        def delayed_cleanup():
            time.sleep(300)  # 5 minutes
            cleanup_task_status(task_id)

        cleanup_thread = threading.Thread(target=delayed_cleanup)
        cleanup_thread.daemon = True
        cleanup_thread.start()

    except Exception as e:
        end_time = time.time()
        status_data = {
            'status': 'error',
            'progress': 0,
            'message': f'An unexpected error occurred: {str(e)}',
            'logs': status_data.get('logs', []) + [f'[error] {str(e)}'],
            'end_time': end_time
        }
        task_status[task_id] = status_data
        save_task_status(task_id, status_data)

        # Schedule cleanup of task status file after 5 minutes
        import threading
        def delayed_cleanup():
            time.sleep(300)  # 5 minutes
            cleanup_task_status(task_id)

        cleanup_thread = threading.Thread(target=delayed_cleanup)
        cleanup_thread.daemon = True
        cleanup_thread.start()


@require_auth
def get_markdown_content(request):
    """Serves the tenant's report Markdown file."""
    markdown_file_path = tenant_path(request.org_id, 'crew_report.md')

    try:
        file_handle = open(markdown_file_path, 'rb')
        response = FileResponse(file_handle, content_type='text/markdown')
        return response
    except FileNotFoundError:
        return HttpResponse("Markdown file not found", status=404)

@csrf_exempt
@require_auth
def run_report(request):
    if request.method == 'POST':
        try:
            import json
            import tempfile

            # Parse the JSON payload from the frontend
            payload = json.loads(request.body)

            # Validate that the user has provided actual input
            yaml_uploaded = payload.get('yaml_uploaded', False)
            has_os = bool(payload.get('os', []))
            has_apps = bool(payload.get('applications', []))
            has_sources = bool(payload.get('sources', []))
            if not yaml_uploaded and not has_os and not has_apps and not has_sources:
                return JsonResponse({
                    'status': 'error',
                    'message': 'Please provide at least one operating system, application, or source type, or upload a YAML configuration file.'
                }, status=400)

            # Generate a unique task ID
            task_id = str(uuid.uuid4())

            # Create a temporary JSON file with the payload
            with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False) as temp_file:
                json.dump(payload, temp_file, indent=2)
                temp_file_path = temp_file.name

            # Log start
            log_action(request.org_id, request.user_id, request.username,
                       "report_run", "started", detail=f"task={task_id}")

            # Start the report generation in a separate thread (pass org_id for tenant isolation)
            thread = threading.Thread(
                target=run_report_async,
                args=(task_id, temp_file_path, request.org_id, request.user_id, request.username),
            )
            thread.daemon = True
            thread.start()

            # Return immediately with task ID
            return JsonResponse({
                'status': 'started',
                'message': 'Report generation started. Use the task ID to check progress.',
                'task_id': task_id
            })
            
        except json.JSONDecodeError as e:
            return JsonResponse({'status': 'error', 'message': f'Invalid JSON payload: {str(e)}'}, status=400)
        except Exception as e:
            return JsonResponse({'status': 'error', 'message': f'An unexpected error occurred: {str(e)}'}, status=500)
    
    return JsonResponse({'status': 'error', 'message': 'Invalid request method.'}, status=405)

@csrf_exempt
@require_auth
def check_task_status(request, task_id):
    """Check the status of a running task"""
    # First check in-memory storage
    if task_id in task_status:
        return JsonResponse(task_status[task_id])
    
    # If not in memory, try to load from file
    status_data = load_task_status(task_id)
    if status_data:
        # Update in-memory storage
        task_status[task_id] = status_data
        return JsonResponse(status_data)
    
    # Task not found
    return JsonResponse({'status': 'error', 'message': 'Task not found'}, status=404)

@require_http_methods(["POST"])
def update_report_api(request):
    try:
        # 1. (Optional) Re-generate the report content
        # If your 'runReport' view saves the content to a file/DB, you can skip this.
        # If this view is solely for *broadcasting* an update after 'generate' is done,
        # then you only need step 2.
        # generate_latest_report() 
        
        # 2. Get the channel layer and send a message to the 'report_updates' group
        channel_layer = get_channel_layer()
        async_to_sync(channel_layer.group_send)(
            "report_updates", # The group name for all listening clients
            {
                "type": "report_update_message", # Custom type to be handled by the consumer
                "message": "The report has been updated. Please refresh content.",
                "action": "content_updated"
            }
        )
        
        return JsonResponse({"message": "Report update signal broadcasted successfully."}, status=200)
    
    except Exception as e:
        return JsonResponse({"message": f"Error broadcasting update signal: {str(e)}"}, status=500)

def run_repo_scan_async(task_id, repo_url, temp_dir_to_cleanup=None,
                        org_id=None, user_id=None, username=""):
    """Run the repo vulnerability scan in a separate thread"""
    start_time = time.time()
    
    try:
        # Initialize task status
        status_data = {
            'status': 'running',
            'progress': 0,
            'message': 'Starting repository vulnerability scan...',
            'start_time': start_time,
            'repo_url': repo_url
        }
        task_status[task_id] = status_data
        save_task_status(task_id, status_data)
        
        # Update progress
        status_data['progress'] = 10
        status_data['message'] = 'Initializing scan pipeline...'
        task_status[task_id] = status_data
        save_task_status(task_id, status_data)
        
        # Update progress
        status_data['progress'] = 30
        status_data['message'] = 'Running vulnerability analysis (this may take several minutes)...'
        task_status[task_id] = status_data
        save_task_status(task_id, status_data)
        
        # Run the pipeline
        result = run_pipeline(repo_url)

        # Generate unified markdown report from the JSON output(s)
        report_markdown = generate_scan_report_markdown(result)

        # Update progress
        status_data['progress'] = 90
        status_data['message'] = 'Finalizing scan results...'
        task_status[task_id] = status_data
        save_task_status(task_id, status_data)

        # Mark as completed
        end_time = time.time()
        duration_ms = int((end_time - start_time) * 1000)
        status_data = {
            'status': 'completed',
            'progress': 100,
            'message': 'Repository vulnerability scan completed successfully!',
            'output': result,
            'report_markdown': report_markdown,
            'repo_url': repo_url,
            'end_time': end_time,
            'duration': end_time - start_time
        }
        task_status[task_id] = status_data
        save_task_status(task_id, status_data)
        if org_id:
            complete_scan_result(task_id, "completed", report_markdown, duration_ms)
            log_action(org_id, user_id, username, "repo_scan", "completed",
                       detail=repo_url if isinstance(repo_url, str) else "uploaded_file",
                       duration_ms=duration_ms)
        
        # Clean up temporary directory if it was created from a file upload
        if temp_dir_to_cleanup and os.path.exists(temp_dir_to_cleanup):
            try:
                shutil.rmtree(temp_dir_to_cleanup)
            except Exception as e:
                print(f"Error cleaning up temp directory {temp_dir_to_cleanup}: {e}")
        
        # Schedule cleanup of task status file after 5 minutes
        def delayed_cleanup():
            time.sleep(300)  # 5 minutes
            cleanup_task_status(task_id)
        
        cleanup_thread = threading.Thread(target=delayed_cleanup)
        cleanup_thread.daemon = True
        cleanup_thread.start()
            
    except Exception as e:
        end_time = time.time()
        status_data = {
            'status': 'error',
            'progress': 0,
            'message': f'Scan failed: {str(e)}',
            'repo_url': repo_url,
            'end_time': end_time,
            'duration': end_time - start_time if 'start_time' in locals() else 0
        }
        task_status[task_id] = status_data
        save_task_status(task_id, status_data)
        if org_id:
            complete_scan_result(task_id, "error")
            log_action(org_id, user_id, username, "repo_scan", "error", detail=str(e)[:500])

        # Clean up temporary directory if it was created from a file upload
        if temp_dir_to_cleanup and os.path.exists(temp_dir_to_cleanup):
            try:
                shutil.rmtree(temp_dir_to_cleanup)
            except Exception as e:
                print(f"Error cleaning up temp directory {temp_dir_to_cleanup}: {e}")
        
        # Schedule cleanup of task status file after 5 minutes
        def delayed_cleanup():
            time.sleep(300)  # 5 minutes
            cleanup_task_status(task_id)
        
        cleanup_thread = threading.Thread(target=delayed_cleanup)
        cleanup_thread.daemon = True
        cleanup_thread.start()

@csrf_exempt
@require_auth
def scan_repo(request):
    """Endpoint to scan a repository for vulnerabilities.
    Accepts either:
    1. JSON payload with 'repo_url' (GitHub URL)
    2. FormData with 'repo_file' (zip file upload)
    """
    if request.method == 'POST':
        try:
            repo_url = None
            temp_dir_to_cleanup = None
            
            # Check if this is a file upload (FormData)
            if 'repo_file' in request.FILES:
                uploaded_file = request.FILES['repo_file']
                
                # Validate file type (should be zip)
                if not uploaded_file.name.endswith('.zip'):
                    return JsonResponse({
                        'status': 'error',
                        'message': 'Invalid file type. Please upload a .zip file containing the repository.'
                    }, status=400)
                
                # Create a temporary directory to extract the zip file
                temp_dir = tempfile.mkdtemp(prefix='repo_scan_')
                temp_dir_to_cleanup = temp_dir
                
                try:
                    # Save uploaded file temporarily
                    temp_zip_path = os.path.join(temp_dir, uploaded_file.name)
                    with open(temp_zip_path, 'wb+') as destination:
                        for chunk in uploaded_file.chunks():
                            destination.write(chunk)
                    
                    # Extract the zip file
                    extract_dir = os.path.join(temp_dir, 'extracted')
                    os.makedirs(extract_dir, exist_ok=True)
                    
                    with zipfile.ZipFile(temp_zip_path, 'r') as zip_ref:
                        zip_ref.extractall(extract_dir)
                    
                    # Find the root of the repository (handle cases where zip contains a single folder)
                    extracted_contents = os.listdir(extract_dir)
                    if len(extracted_contents) == 1:
                        # If there's a single folder, use that as the repo root
                        repo_path = os.path.join(extract_dir, extracted_contents[0])
                        if os.path.isdir(repo_path):
                            repo_url = repo_path
                        else:
                            repo_url = extract_dir
                    else:
                        # Multiple files/folders, use extract_dir as root
                        repo_url = extract_dir
                    
                    # Clean up the zip file
                    os.remove(temp_zip_path)
                    
                except zipfile.BadZipFile:
                    # Clean up on error
                    if os.path.exists(temp_dir):
                        shutil.rmtree(temp_dir)
                    return JsonResponse({
                        'status': 'error',
                        'message': 'Invalid zip file. Please ensure the file is a valid zip archive.'
                    }, status=400)
                except Exception as e:
                    # Clean up on error
                    if os.path.exists(temp_dir):
                        shutil.rmtree(temp_dir)
                    return JsonResponse({
                        'status': 'error',
                        'message': f'Error processing uploaded file: {str(e)}'
                    }, status=500)
            
            # If not a file upload, try to parse JSON payload
            elif request.content_type and 'application/json' in request.content_type:
                try:
                    payload = json.loads(request.body)
                    repo_url = payload.get('repo_url') or payload.get('repo') or payload.get('url')
                except json.JSONDecodeError as e:
                    return JsonResponse({
                        'status': 'error',
                        'message': f'Invalid JSON payload: {str(e)}'
                    }, status=400)
            
            # Validate that we have a repo_url or file
            if not repo_url:
                return JsonResponse({
                    'status': 'error',
                    'message': 'Missing required parameter: either provide repo_url in JSON payload or upload a repo_file (zip)'
                }, status=400)
            
            # Generate a unique task ID
            task_id = str(uuid.uuid4())
            target_label = repo_url if isinstance(repo_url, str) and repo_url.startswith('http') else 'uploaded_file'
            input_type   = 'url' if isinstance(repo_url, str) and repo_url.startswith('http') else 'file'

            # Persist scan record and log start
            create_scan_result(request.org_id, request.user_id, request.username,
                               task_id, target_label, input_type)
            log_action(request.org_id, request.user_id, request.username,
                       "repo_scan", "started", detail=target_label)

            # Start the scan in a separate thread
            thread = threading.Thread(
                target=run_repo_scan_async,
                args=(task_id, repo_url, temp_dir_to_cleanup,
                      request.org_id, request.user_id, request.username),
            )
            thread.daemon = True
            thread.start()

            # Return immediately with task ID
            return JsonResponse({
                'status': 'started',
                'message': 'Repository vulnerability scan started. Use the task ID to check progress.',
                'task_id': task_id,
                'repo_url': target_label,
            })
            
        except Exception as e:
            # Clean up temp directory if it was created
            if temp_dir_to_cleanup and os.path.exists(temp_dir_to_cleanup):
                try:
                    shutil.rmtree(temp_dir_to_cleanup)
                except:
                    pass
            return JsonResponse({
                'status': 'error',
                'message': f'An unexpected error occurred: {str(e)}'
            }, status=500)
    
    return JsonResponse({
        'status': 'error',
        'message': 'Invalid request method. Use POST.'
    }, status=405)


# ── Scan history (per-tenant) ─────────────────────────────────────────────────

@csrf_exempt
@require_auth
def get_scan_history(request):
    """GET /api/scan/history/  — returns this org's scans, newest first."""
    from .models import ScanResult
    qs = ScanResult.objects.filter(organization_id=request.org_id).order_by('-created_at')[:50]
    rows = [{
        'id':           str(r.id),
        'task_id':      r.task_id,
        'username':     r.username,
        'target':       r.target,
        'input_type':   r.input_type,
        'status':       r.status,
        'duration_ms':  r.duration_ms,
        'created_at':   r.created_at.isoformat(),
        'completed_at': r.completed_at.isoformat() if r.completed_at else None,
        'has_report':   bool(r.report_markdown),
    } for r in qs]
    return JsonResponse({'scans': rows})


@csrf_exempt
@require_auth
def get_scan_report(request, task_id):
    """GET /api/scan/history/<task_id>/report/  — returns markdown for one scan."""
    from .models import ScanResult
    try:
        r = ScanResult.objects.get(task_id=task_id, organization_id=request.org_id)
    except ScanResult.DoesNotExist:
        return JsonResponse({'error': 'Not found'}, status=404)
    return JsonResponse({'report_markdown': r.report_markdown, 'target': r.target})
