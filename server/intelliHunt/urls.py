"""
URL configuration for intelliHunt project.

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/4.2/topics/http/urls/
Examples:
Function views
    1. Add an import:  from my_app import views
    2. Add a URL to urlpatterns:  path('', views.home, name='home')
Class-based views
    1. Add an import:  from other_app.views import Home
    2. Add a URL to urlpatterns:  path('', Home.as_view(), name='home')
Including another URLconf
    1. Import the include() function: from django.urls import include, path
    2. Add a URL to urlpatterns:  path('blog/', include('blog.urls'))
"""

from django.contrib import admin
from django.urls import path, re_path, include
from django.views.generic import TemplateView
from django.conf import settings
from django.conf.urls.static import static
from .reportApp import views
from .views import ReactAppView
from django.http import HttpResponse

def health_check(request):
    return HttpResponse("Django API is running. Access the frontend at http://localhost:3000.", status=200)


urlpatterns = [
    path("admin/", admin.site.urls),
    path('api/markdown/', views.get_markdown_content, name='markdown_content'),
    path('api/generate/', views.run_report, name='run_script'),
    path('api/task/<str:task_id>/', views.check_task_status, name='check_task_status'),
    path('api/update/', views.update_report_api, name='update_report_signal'),
    path('api/yaml/template/', views.get_yaml_template, name='yaml_template'),
    path('api/yaml/upload/', views.upload_yaml_config, name='upload_yaml_config'),
    path('api/yaml/config/', views.get_current_yaml_config, name='get_yaml_config'),
    path('api/scan/repo/', views.scan_repo, name='scan_repo'),
    path('', health_check, name='health_check'),
    # The "catch-all" pattern that serves the React app
    #re_path(r'^.*', TemplateView.as_view(template_name='index.html')),
    #re_path(r'^.*', ReactAppView.as_view(), name='react_app'), # Catch-all for React
]


# Serve the React App's index.html for all other routes
# if not settings.DEBUG:
#     urlpatterns += [re_path(r'^.*', TemplateView.as_view(template_name='index.html'))]

# if not settings.DEBUG:
#     urlpatterns += static(settings.STATIC_URL, document_root=settings.STATIC_ROOT)
#     urlpatterns += [
#         re_path(r'^(?:.*)/?$', TemplateView.as_view(template_name='index.html')),
#     ]

# Add this to serve static files in development
if settings.DEBUG:
    urlpatterns += static(settings.STATIC_URL, document_root=settings.STATIC_ROOT)