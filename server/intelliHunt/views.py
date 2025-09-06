from django.http import HttpResponse

def ReactAppView(request):
    return HttpResponse("Django API is running. Use the Next.js frontend at http://localhost:3000.", status=200)