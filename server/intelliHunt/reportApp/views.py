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
                
                # Save the uploaded YAML file
                config_path = os.path.join(settings.BASE_DIR, 'intelliHunt/crew/NVD/config/organization_cmdb.yaml')
                with open(config_path, 'w') as f:
                    f.write(yaml_content)
                
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

def get_current_yaml_config(request):
    """Get the current YAML configuration"""
    config_path = os.path.join(settings.BASE_DIR, 'intelliHunt/crew/NVD/config/organization_cmdb.yaml')
    
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

def run_report_async(task_id, payload_file_path):
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
        process = subprocess.Popen(
            ['python', '-u', script_path, payload_file_path],
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1
        )

        full_output = []
        deadline = time.time() + 900  # 15-minute timeout

        for line in process.stdout:
            line = line.rstrip('\n')
            full_output.append(line)
            status_data['logs'].append(line)
            task_status[task_id] = status_data
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

        # Read the generated report markdown to include in the response
        report_markdown = ""
        report_path = os.path.join(settings.BASE_DIR, 'intelliHunt/crew/crew_report.md')
        try:
            with open(report_path, 'r', encoding='utf-8') as f:
                report_markdown = f.read()
        except Exception as e:
            print(f"Warning: Could not read report file: {e}")

        # Mark as completed
        end_time = time.time()
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


def get_markdown_content(request):
    """Serves the raw Markdown file as a text/markdown HTTP response."""

    # Path to your Markdown file
    markdown_file_path = os.path.join(settings.BASE_DIR, 'intelliHunt/crew/crew_report.md')

    try:
        # Open and read the file in binary mode for streaming
        file_handle = open(markdown_file_path, 'rb')

        # Use FileResponse for efficient streaming of large files
        response = FileResponse(file_handle, content_type='text/markdown')

        return response
    except FileNotFoundError:
        return HttpResponse("Markdown file not found", status=404)

@csrf_exempt
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
            
            # Start the report generation in a separate thread
            thread = threading.Thread(target=run_report_async, args=(task_id, temp_file_path))
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

def run_repo_scan_async(task_id, repo_url, temp_dir_to_cleanup=None):
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
        
        # Update progress
        status_data['progress'] = 90
        status_data['message'] = 'Finalizing scan results...'
        task_status[task_id] = status_data
        save_task_status(task_id, status_data)
        
        # Mark as completed
        end_time = time.time()
        status_data = {
            'status': 'completed',
            'progress': 100,
            'message': 'Repository vulnerability scan completed successfully!',
            'output': result,
            'repo_url': repo_url,
            'end_time': end_time,
            'duration': end_time - start_time
        }
        task_status[task_id] = status_data
        save_task_status(task_id, status_data)
        
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
            
            # Start the scan in a separate thread
            thread = threading.Thread(target=run_repo_scan_async, args=(task_id, repo_url, temp_dir_to_cleanup))
            thread.daemon = True
            thread.start()
            
            # Return immediately with task ID
            return JsonResponse({
                'status': 'started',
                'message': 'Repository vulnerability scan started. Use the task ID to check progress.',
                'task_id': task_id,
                'repo_url': repo_url if isinstance(repo_url, str) and repo_url.startswith('http') else 'uploaded_file'
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
