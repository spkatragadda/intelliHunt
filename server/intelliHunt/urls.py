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
from .reportApp import auth_views
from .reportApp import admin_views
from .reportApp import reset_views
from .reportApp import trends_views
from .knowledge_graph import views as graph_views
from .knowledge_graph.wiki import views as wiki_views
from .views import ReactAppView
from django.http import HttpResponse

def health_check(request):
    return HttpResponse("Django API is running. Access the frontend at http://localhost:3000.", status=200)


urlpatterns = [
    path("admin/", admin.site.urls),

    # ── Auth endpoints ────────────────────────────────────────────────────────
    path("api/auth/register/",        auth_views.register,              name="auth_register"),
    path("api/auth/login/",           auth_views.login_view,            name="auth_login"),
    path("api/auth/refresh/",         auth_views.refresh_view,          name="auth_refresh"),
    path("api/auth/me/",              auth_views.me,                    name="auth_me"),
    path("api/auth/logout/",          auth_views.logout_view,           name="auth_logout"),
    path("api/auth/forgot-password/", reset_views.forgot_password,      name="auth_forgot_password"),
    path("api/auth/reset-password/",  reset_views.reset_password,       name="auth_reset_password"),

    # ── Application endpoints (all require JWT) ───────────────────────────────
    path('api/markdown/', views.get_markdown_content, name='markdown_content'),
    path('api/generate/', views.run_report, name='run_script'),
    path('api/task/<str:task_id>/', views.check_task_status, name='check_task_status'),
path('api/yaml/template/', views.get_yaml_template, name='yaml_template'),
    path('api/yaml/upload/', views.upload_yaml_config, name='upload_yaml_config'),
    path('api/yaml/config/', views.get_current_yaml_config, name='get_yaml_config'),
    path('api/scan/repo/', views.scan_repo, name='scan_repo'),
    # CMDB integration endpoints
    path('api/cmdb/integrations/', views.cmdb_integrations, name='cmdb_integrations'),
    path('api/cmdb/integrations/<str:integration_id>/', views.delete_cmdb_integration, name='delete_cmdb_integration'),
    path('api/cmdb/test/', views.test_cmdb_connection, name='test_cmdb_connection'),
    path('api/cmdb/import/', views.import_cmdb_data, name='import_cmdb_data'),
    # Scan history (per-tenant)
    path('api/scan/history/', views.get_scan_history, name='scan_history'),
    path('api/scan/history/<str:task_id>/report/', views.get_scan_report, name='scan_report'),
    path('api/scan/history/<str:task_id>/', views.delete_scan, name='delete_scan'),
    path('api/scan/cancel/<str:task_id>/', views.cancel_scan, name='cancel_scan'),
    # Schedule + notifications
    path('api/schedule/', views.schedule_config, name='schedule_config'),
    path('api/notifications/', views.notifications_list, name='notifications_list'),
    path('api/notifications/read/', views.notifications_mark_read, name='notifications_mark_read'),
    # Historical trending / report archive / CISO executive summary
    path('api/reports/history/',                      trends_views.report_history,        name='report_history'),
    path('api/reports/history/<str:artifact_id>/',    trends_views.report_history_detail, name='report_history_detail'),
    path('api/trends/',                               trends_views.trends,                name='trends'),
    path('api/trends/executive-summary/',             trends_views.executive_summary,     name='executive_summary'),
    path('api/reports/export/ciso/',                  trends_views.export_ciso_pdf,       name='export_ciso_pdf'),
    # Admin endpoints
    path('api/admin/summary/',                        admin_views.admin_summary,    name='admin_summary'),
    path('api/admin/activity/',                       admin_views.admin_activity,   name='admin_activity'),
    path('api/admin/pending/',                        admin_views.list_pending_users, name='admin_pending_users'),
    path('api/admin/users/<str:user_id>/',            admin_views.delete_user,      name='admin_delete_user'),
    path('api/admin/users/<str:user_id>/approve/',    admin_views.approve_user,     name='admin_approve_user'),
    path('api/admin/users/<str:user_id>/reject/',     admin_views.reject_user,      name='admin_reject_user'),
    # ── Knowledge Wiki endpoints ────────────────────────────────────────────
    path('api/wiki/',                                           wiki_views.wiki_index,          name='wiki_index'),
    path('api/wiki/search/',                                    wiki_views.wiki_search,         name='wiki_search'),
    path('api/wiki/log/',                                       wiki_views.wiki_log,            name='wiki_log'),
    path('api/wiki/query/',                                     wiki_views.wiki_query_endpoint, name='wiki_query'),
    path('api/wiki/<str:entity_type>/',                         wiki_views.wiki_list_by_type,   name='wiki_list_by_type'),
    path('api/wiki/<str:entity_type>/<path:entity_id>/',        wiki_views.wiki_page_detail,    name='wiki_page_detail'),
    path('api/wiki/refresh/<str:entity_type>/<path:entity_id>/',wiki_views.wiki_refresh_page,   name='wiki_refresh_page'),
    # ── Knowledge Graph endpoints ────────────────────────────────────────────
    path('api/graph/stats/',                                    graph_views.graph_stats,        name='graph_stats'),
    path('api/graph/software/',                                 graph_views.graph_software,     name='graph_software'),
    path('api/graph/threat-actors/',                            graph_views.graph_threat_actors, name='graph_threat_actors'),
    path('api/graph/neighbors/<str:node_type>/<path:node_id>/', graph_views.node_neighbors,     name='node_neighbors'),
    path('api/graph/sync/',                                     graph_views.sync_status,        name='graph_sync_status'),
    path('api/graph/sync/trigger/',                             graph_views.trigger_sync,       name='trigger_graph_sync'),
    path('api/graph/research-config/',                          graph_views.graph_research_config, name='graph_research_config'),

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