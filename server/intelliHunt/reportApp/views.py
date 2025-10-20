import os
import uuid
import threading
import time
import yaml
import json
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
        # Initialize task status
        status_data = {
            'status': 'running',
            'progress': 0,
            'message': 'Starting report generation...',
            'start_time': start_time
        }
        task_status[task_id] = status_data
        save_task_status(task_id, status_data)
        
        # Update progress
        status_data['progress'] = 10
        status_data['message'] = 'Loading CPE data...'
        task_status[task_id] = status_data
        save_task_status(task_id, status_data)
        
        # The full path to your script
        script_path = 'intelliHunt/crew/system.py'
        
        # Update progress
        status_data['progress'] = 20
        status_data['message'] = 'Running vulnerability analysis...'
        task_status[task_id] = status_data
        save_task_status(task_id, status_data)
        
        # Use subprocess to run the script with the payload file as argument
        result = subprocess.run(['python', script_path, payload_file_path], 
                              check=True, capture_output=True, text=True)
        
        # Update progress
        status_data['progress'] = 90
        status_data['message'] = 'Generating final report...'
        task_status[task_id] = status_data
        save_task_status(task_id, status_data)
        
        # Mark as completed
        end_time = time.time()
        status_data = {
            'status': 'completed',
            'progress': 100,
            'message': 'Report generation completed successfully!',
            'output': result.stdout,
            'end_time': end_time,
            'duration': end_time - start_time
        }
        task_status[task_id] = status_data
        save_task_status(task_id, status_data)
        
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
            
    except subprocess.CalledProcessError as e:
        end_time = time.time()
        status_data = {
            'status': 'error',
            'progress': 0,
            'message': f'Script failed with error: {e.stderr}',
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
