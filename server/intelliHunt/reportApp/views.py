import os
from django.http import HttpResponse, FileResponse
from django.conf import settings

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