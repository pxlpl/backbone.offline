//var fixtures ={};
//fixtures.pizzas=[
//    {id:1, name:"Pepperoni",   restaurant_id:1, toppings:[1,2,3]},
//    {id:2, name:"Capriciosa",  restaurant_id:2, toppings:[1,2,4,5,6,]},
//    {id:3, name:"Margarita",   restaurant_id:3, toppings:[1,2]},
//    {id:4, name:"Everything",  restaurant_id:4, toppings:[1,2,3,4,5,6,7]}
//];
//fixtures.toppings=[
//    {id:1,name:"cheese",                 pizzas:[]},
//    {id:2,name:"tomato sauce",           pizzas:[]},
//    {id:3,name:"pepperoni",              pizzas:[]},
//    {id:4,name:"gorgonzola",             pizzas:[]},
//    {id:5,name:"mushrooms",              pizzas:[]},
//    {id:6,name:"ham",                    pizzas:[]},
//    {id:7,name:"onion",                  pizzas:[]}
//];
//fixtures.restaurants=[
//    {id:1,name:"Luigi",    city:"Rome",      pizzas:[]},
//    {id:2,name:"Mario",    city:"Milan",     pizzas:[]},
//    {id:3,name:"Antonio",  city:"Rome",      pizzas:[]},
//    {id:4,name:"Manhatan", city:"New York",  pizzas:[]}
//];
//
//
//// finalizing - connecting relations
//_.each(fixtures.pizzas,function(pizza){
//    _.each(pizza.toppings,function(topping_id){
//        var topping = _.find(fixtures.toppings,function(topping){return topping.id==topping_id});
//        topping.pizzas.push(pizza.id);
//
//    });
//    var restaurant = _.find(fixtures.restaurants,function(restaurant){return restaurant.id==pizza.restaurant_id});
//    restaurant.pizzas.push(pizza.id);
//
//});

Factory.prototype.lazy=function(attr, callback) {
    this._lazy.push(attr);
    this.attrs[attr] = function(){return callback};
    return this;
};
//
Factory.builds={};

Factory.define = _.wrap(Factory.define,function(define,name,constructor){
    var factory = (define.bind(Factory))(name,constructor);
    factory.name=name;
    factory._lazy=[];
    Factory.builds[name] = [];
    return factory;
});
Factory.build = _.wrap(Factory.build,function(build,name,attrs){
    var result = (build.bind(Factory))(name,attrs);
    Factory.builds[name].push(result);
    return result;
});
//

Factory.clear = function(){
    _.each(Factory.builds,function(v,k){
       Factory.builds[k].length=0;
    });
};

Factory.done = function(){
    _.each(Factory.builds,function(instances,name){
        var factory = Factory.factories[name];
        _.each(instances,function(instance){
            _.each(factory._lazy,function(attr){
                instance[attr]=(instance[attr].bind(instance))();
            })
        });
    });
};


Factory.define('pizza')
    .sequence('id')
    .sequence('name',function(i){return 'pizza'+i})
    .attr('_updated', function() { return new Date(); })
    .lazy('toppings', function() {
        var toppings = Factory.builds['topping'];
        toppings =  _.first(_.shuffle(toppings),_.random(0,5));
        _.each(toppings,function(topping){
            topping.pizzas.push(this.id);
        }.bind(this));
        return _.pluck(toppings,'id');

    });

Factory.define('topping')
    .sequence('id')
    .attr('pizzas',function(){return []})
    .sequence('name', function(i) { return 'topping' + i; });


var fixtures = function(limit){
    _.defaults(limit,{
        pizzas:100,
        toppings:100
    });


    Factory.clear();
    //

    var pizzas = _.map(_.range(0,limit.pizzas),function(){
       return Factory.build('pizza')
    });
    var toppings = _.map(_.range(0,limit.toppings),function(){
        return Factory.build('topping')
    });

    Factory.done();

    return {
        pizzas:pizzas,
        toppings:toppings
    }
};








