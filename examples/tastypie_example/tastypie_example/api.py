from tastypie.resources import ModelResource
from tastypie_example.models import Pizza, Topping


class PizzaResource(ModelResource):
    class Meta:
        queryset = Pizza.objects.all()


class ToppingResource(ModelResource):
    class Meta:
        queryset = Topping.objects.all()
