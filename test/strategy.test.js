describe("strategy testing suite", function(){
    var async = new AsyncSpec(this);
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
        spyOn(Offline,'remote').andCallFake(function(method,model,options){
            var success = _.clone(model.attributes);
            if(model instanceof Backbone.Collection){
                success = [];
            }
            options.success(success);
            return $.Deferred().resolve()
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


    async.it("can update local relations to remote relations",function(done){
        spyOn(Offline,'remote').andCallFake(function(method,model,options){
           if(model instanceof Backbone.Collection){
               // always read
               options.success([],{});
           }else{
               var record = _.clone(model.attributes);
               if(method=='create'){
                   record.id = 1;
               }
               options.success(record);
           }
           return $.Deferred().resolve();
        });

        var pizza = new PizzaModel();
        var topping = new ToppingModel();

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


    async.it("can fetch models using synchronization", function(done){
        var pizzas = [
            {id:1},
            {id:2},
            {id:3}
        ];

         spyOn(Offline,'remote').andCallFake(function(method,model,options){
             var success = _.clone(model.attributes);
             if(model instanceof PizzaCollection){
                 success = pizzas;
             }

             options.success(success);
             return $.Deferred().resolve();
         });

         synchronize([PizzaSynchronizer]).all.done(function(){
             PizzaStore.find({})
                 .done(function(pizzas){
                     expect(pizzas.length).toEqual(pizzas.length);
                     done();
                 });
             done();
         });


    });


    async.it("will update local state with the one received from the server", function(done){
         spyOn(Offline,'remote').andCallFake(function(method,model,options){
            if(method=='read'&&model instanceof PizzaCollection){
                options.success([{id:1,name:"server pizza"}]);
            }
            return $.Deferred().resolve();
         });
         PizzaStore.save({id: 1, pizza: "client pizza"})
            .done(function(){
                 synchronize([PizzaSynchronizer]).all
                     .done(function(){
                         PizzaStore.get(1).done(function(record){
                            expect(record.name).toEqual("server pizza");
                         done();
                     });
                 });
            });
    });


    async.it("sends headers so the server won't modify newer record with older record", function(done){

        spyOn(Offline,'remote').andCallFake(function(method,model,options){
            if(method=='update'){
                expect(options.headers['If-Unmodified-Since']).toBeDefined();
                var response = {id:model.id,name:"new pizza"};
                options.error(model,response);
                return $.Deferred().reject({status:412,response:response});
            }else{
                options.success([]);
            }
            return $.Deferred().resolve();
        });
        PizzaStore.save({_dirty: true, id: 1, name: "old pizza"})
            .done(function(){
                synchronize([PizzaSynchronizer]).all.done(function(){
                     PizzaStore.get(1).done(function(record){
                         expect(record.name).toEqual("new pizza");
                         done();
                     });
             });
        });
    });
//



});