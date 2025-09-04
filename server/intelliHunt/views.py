from django.views.generic import TemplateView

class ReactAppView(TemplateView):
    template_name = 'index.html'