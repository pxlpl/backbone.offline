from django.conf.urls.defaults import *
from tastypie.api import Api
from tastypie_example.api import PizzaResource, ToppingResource
from django.views.generic import TemplateView

v1_api = Api(api_name='v1')
v1_api.register(PizzaResource())
v1_api.register(ToppingResource())

urlpatterns = patterns('',
    (r'^$', TemplateView.as_view(template_name="index.html")),
    (r'^api/', include(v1_api.urls)),
)
