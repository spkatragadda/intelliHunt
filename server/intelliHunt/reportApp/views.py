import os
from django.http import HttpResponse, FileResponse
from django.conf import settings
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
import subprocess


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
            # The full path to your script
            script_path = 'intelliHunt/crew/system.py'
            
            # Use subprocess to run the script
            # `check=True` will raise an exception if the command fails
            result = subprocess.run(['python', script_path], check=True, capture_output=True, text=True)
            
            return JsonResponse({'status': 'success', 'message': 'Script ran successfully.', 'output': result.stdout})
        except subprocess.CalledProcessError as e:
            return JsonResponse({'status': 'error', 'message': f'Script failed with error: {e.stderr}'}, status=500)
        except Exception as e:
            return JsonResponse({'status': 'error', 'message': f'An unexpected error occurred: {str(e)}'}, status=500)
    
    return JsonResponse({'status': 'error', 'message': 'Invalid request method.'}, status=405)