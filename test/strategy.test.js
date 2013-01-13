FakeModelSync = function(method, model, options){
    var modelName = _lookup(model);
    var dfd = $.Deferred();
    var rv;
    switch (method){
            case "read":
                rv = FakeRest[modelName][model.id];
                break;
            case "create":
                var record = _.clone(model.attributes);
                record.id = parseInt(_.uniqueId());
                record._updated = new Date();
                FakeRest[modelName][model.id] = record;
                rv = record;
                break;
            case "update":
                var record = _.clone(model.attributes);

                if (options.headers['If-Unmodified-Since']){
                    var ifUnmodifiedSince = new Date(options.headers['If-Unmodified-Since']);    
                    var oldUpdated = new Date(FakeRest[modelName][model.id]._updated);
                    if (oldUpdated > ifUnmodifiedSince){
                        options.error(FakeRest[modelName][model.id]);
                        _.defer(function(){dfd.reject({status: 412})});
                        return dfd.promise();
                    }
                }
                
                record._updated = new Date();
                FakeRest[modelName][model.id] = record;
                rv = record;
                break;

            case "delete":
                delete FakeRest[modelName][model.id];
                break
    }
    options.success(rv);
    dfd.resolve(rv);
    return dfd.promise();
};

FakeCollectionSync = function(method, collection, options){
    var modelName = _lookup(collection);
    var dfd = $.Deferred();
    var rv;

    switch (method){
        case "read":

            rv = _.values(FakeRest[modelName]);
            if (options['data']['updated__gte']){
                rv = _.reject(rv, function(record){
                    return new Date(record._updated) < new Date(options['data']['updated__gte']);
                });
            }
            break;
    }
    options.success(rv);
    dfd.resolve(rv);
    return dfd.promise(rv);
};

FakeSync = function(method, model, options){
    if (model instanceof Backbone.Model){    
        return FakeModelSync(method, model, options)
    } else {
        return FakeCollectionSync(method, model, options);
    }
};

FakeRest = {
    "PizzaModel": {},
    "ToppingModel": {}
};

lookupMap = {
    "PizzaModel": [PizzaModel, PizzaCollection],
    "ToppingModel": [ToppingModel, ToppingCollection]
};

_lookup = function(modelOrCollection){
    var rv;
    _.each(lookupMap, function(candidates, name){
        if (_.any(candidates, function(candidate){
            return modelOrCollection instanceof candidate;
        })){
            rv = name;
        }
    });
    return rv;
};

describe("strategy testing suite", function(){
    var async = new AsyncSpec(this);
    beforeEach(function(){
        FakeRest = {
            "PizzaModel": {},
            "ToppingModel": {}
        };

        spyOn(Offline, "remote").andCallFake(FakeSync);
    });

    async.beforeEach(connectTestDB);
    async.afterEach(clearTestDB);


    async.it("can create a model in an empty database, should receive new ID", function(done){
        var pizzaRecord = {id:Offline.uuid(),_dirty:true,'t':true};
        spyOn(PizzaModel.prototype,'save').andCallFake(function(){
            this.set('id',1);
            var dfd = $.Deferred();
            _.defer(dfd.resolve);
            return dfd.promise();
        });
        spyOn(PizzaSynchronizer,'createRecord').andCallThrough();
        PizzaStore.save(pizzaRecord).done(function(){
            var global = synchronize([PizzaSynchronizer]);
            global.all.done(function(){
                expect(PizzaSynchronizer.createRecord).toHaveBeenCalled();
                PizzaStore.find().done(function(records){
                    expect(records.length).toEqual(1);
                    expect(Synchronizer.isLocal(records[0])).toBeFalsy();
                    done();
                });
            });
        });
    });

    async.it("can preserve relations to local models",function(done){
        var pizza = new PizzaModel({name:"pizzaA"});
        var topping = new ToppingModel({name:"toppingA"});
        $.when(pizza.save(), topping.save()).done(function(){

            pizza.set('toppings', [topping.id]);
            pizza.save().done(function(){
               synchronize([PizzaSynchronizer, ToppingSynchronizer]).all.done(function(){
                    $.when(PizzaStore.find(),ToppingStore.find()).done(
                        function(pizzas,toppings){
                            expect(pizzas.length).toEqual(1);
                            expect(toppings.length).toEqual(1);
                                expect(pizzas[0].toppings).toEqual([toppings[0].id]);
                                expect(toppings[0].pizzas).toEqual([pizzas[0].id]);
                                done();
                        })

                });
            });
        });
    });


    async.it("can fetch and create models using synchronization", function(done){

         var pizza1 = {id: parseInt(_.uniqueId()), name: "pizza 1"};
         var pizza2 = {id: parseInt(_.uniqueId()), name: "pizza 2"};
         FakeRest["PizzaModel"][pizza1.id] = pizza1;
         FakeRest["PizzaModel"][pizza2.id] = pizza2;

         var pizza = new PizzaModel({name: "nowa pizza"});
         pizza.save();

         synchronize([PizzaSynchronizer]).all.done(function(){
             PizzaStore.find({})
             .done(function(pizzas){
                 expect(pizzas.length).toEqual(3);
                 var pizzasIds = _.unique(_.pluck(pizzas, 'id'));
                 expect(pizzasIds).toContain(pizza1.id);
                 expect(pizzasIds).toContain(pizza2.id);
                 var onlyNewIDs = _.without(pizzasIds, pizza1.id, pizza2.id);
                 expect(onlyNewIDs.length).toEqual(1);
                 done();
             });
             done();
         });

        
    });


    async.it("will update local state with the one received from the server", function(done){
         FakeRest["PizzaModel"][1] = {id: 1, pizza: "server pizza"};
         $.when(
             PizzaStore.save({id: 1, pizza: "client pizza"})
             ).done(function(){
                 synchronize([PizzaSynchronizer]).all.done(function(){
                         PizzaStore.get(1).done(function(record){
                         expect(record.pizza).toEqual("server pizza");
                         done();
                     });
                 });
             });
    });

    async.it("won't update server database when the data was modified since the last sync", function(done){
         FakeRest["PizzaModel"][1] = {id: 1, _updated: new Date("2038-10-10"), pizza: "server pizza"};
         $.when(
             PizzaStore.save({_dirty: true, id: 1, pizza: "older client pizza"})
             ).done(function(){
                 synchronize([PizzaSynchronizer]).all.done(function(){
                         PizzaStore.get(1).done(function(record){
                             expect(record.pizza).toEqual("server pizza");
                             done();
                         });
                 });
             });
    });



    
});