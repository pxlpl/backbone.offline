describe("Manager testing suite", function() {
    var async = new AsyncSpec(this);


    async.beforeEach(connectTestDB);

    async.afterEach(clearTestDB);

    describe("testing basic CRUD operations", function(){
        async.it("can save and retrieve what it saved", function(done){
            var pizza = new PizzaModel();
            var notAPizza = new PizzaModel({flavour: "lies"});

            pizza.set("name", "pepperoni");
            $.when(pizza.save(), notAPizza.save())
                .done(function(){
                    expect(pizza.id).not.toBe(undefined);

                    var isItPizza = new PizzaModel({id: pizza.id});
                    isItPizza.fetch().done(function(){
                        expect(isItPizza.get('name')).toEqual("pepperoni");
                        expect(isItPizza.get("flavour")).not.toEqual("lies");
                    })
                        .always(done);
                });

        });
    });

    describe("testing handling of relations", function(){

        async.it("updates m2m relation", function(done) {

//            var failed = jasmine.createSpy('failedToGet');
//            var succeeded = jasmine.createSpy('gotRecord');

            var pizza = new PizzaModel();
            var topping = new ToppingModel();
            $.when(pizza.save(),topping.save()).done(function(){

                pizza.set('toppings',[topping.id]);
                pizza.save().done(function(){

                    topping.fetch().done(function(){
                        expect(topping.get('pizzas')).toEqual([pizza.id]);
                        done();
                    })
                })
            });

        });

    });

});


describe("New Manager Testing suite",function(){
    var async = new  AsyncSpec(this);

    async.beforeEach(connectTestDB);
    async.afterEach(clearTestDB);



    async.it("With empty stores creating basic local records",function(done){
        var f = fixtures({pizzas:100,toppings:0});
        $.when.apply($,_.map(f,function(record){
            record = _.omit(record,'id');
            var expected = _.extend(record,{_dirty:true});
            var model  = new PizzaModel(record);
            model.save().done(function(){
                var attrs = model.attributes;
                expect(_.omit(attrs,'id')).toEqual(expected);
            })
        })).done(done);
    });

    async.it("Manager can remove M2M relations",function(done){
        var pizzaRecord = {id:1,toppings:[2]};
        var toppingRecord = {id:2,pizzas:[1]};
        $.when(PizzaStore.save(pizzaRecord),ToppingStore.save(toppingRecord)).done(function(){
            var pizza = new PizzaModel(pizzaRecord);
            var topping = new ToppingModel(toppingRecord);
            pizza.set('toppings',[]).save().done(function(){
               topping.fetch().done(function(){
                   expect(pizza.attributes.toppings).toEqual([]);
                   expect(topping.attributes.pizzas).toEqual([]);
                   done();
               })
            });
        });
    });


    async.it("Manager can add M2M relations",function(done){
        var pizzaRecord = {id:1,toppings:[]};
        var toppingRecord = {id:2,pizzas:[]};
        $.when(PizzaStore.save(pizzaRecord),ToppingStore.save(toppingRecord)).done(function(){
            var pizza = new PizzaModel(pizzaRecord);
            pizza.set('toppings',[toppingRecord.id]);
            pizza.save().done(function(){
                var topping = new ToppingModel(toppingRecord);
                $.when(pizza.fetch(),topping.fetch()).done(function(){
                    expect(pizza.attributes.toppings).toEqual([topping.id]);
                    expect(topping.attributes.pizzas).toEqual([pizza.id]);
                    done();
                });
            });
        })
    });


});






describe("Manager CRUD Test Suite",function(){
    var async = new AsyncSpec(this);
    async.beforeEach(connectTestDB);
    async.afterEach(clearTestDB);

    describe("create method Test Suite",function(){
        async.it("calls Store.save() with record having uuid",function(done){
            spyOn(PizzaStore,'save').andCallFake(function(){
                return $.Deferred().resolve().promise();
            });
            var model = new PizzaModel({secret:Offline.uuid()});
            PizzaManager.create(model).done(function(){
                var args = PizzaStore.save.mostRecentCall.args;
                expect(PizzaStore.save.calls.length).toEqual(1);
                expect(args.length).toEqual(1);
                expect(args[0].id).not.toBeUndefined();
                expect(args[0].secret).toEqual(model.get('secret'));
                expect(args[0]._dirty).toEqual(true);
                expect(PizzaStore.save).toHaveBeenCalledWith(PizzaManager.toRecord(model));
                done();
            });

        });

        async.it("calls success with (resp, status, xhr) before resolving",function(done){
            var record = {secret:Offline.uuid()};
            var model = new PizzaModel(record);
            var options = {success:new Function};
            spyOn(options,'success').andCallThrough();
            PizzaManager.create(model,options).done(function(){
                expect(options.success).toHaveBeenCalled();
                // Todo: check args passed 
                done();
            })
        });
        async.it("calls error with (xhr, status, thrown) before rejecting",function(done){
            var record = {id:1,secret:Offline.uuid()};
            var model = new PizzaModel(record);
            var options = {error:new Function};
            spyOn(options,'error').andCallThrough();
            spyOn(PizzaStore,'save').andCallFake(function(){
                return $.Deferred().reject().promise();
            });

            PizzaManager.create(model,options).fail(function(){
                expect(options.error).toHaveBeenCalled();
                // Todo: check args passed
                done();
            })
        });
        async.it("ads uuid to new model and creates local only record",function(done){
            var pizza = new PizzaModel({secret:Offline.uuid()});
            spyOn(PizzaStore,'save').andCallFake(function(){
                return $.Deferred().resolve().promise();
            });
            PizzaManager.create(pizza).done(function(){
                expect(PizzaStore.save).toHaveBeenCalled();
                expect(pizza.id).not.toBeUndefined();
                expect(PizzaSynchronizer.isLocal(pizza.id)).toBeTruthy();
                done();
            });
        });
    });

    describe("update method Test Suite",function(){
        async.it("calls success with (resp, status, xhr) before resolving",function(done){
            var record = {id:1,secret:Offline.uuid()};
            var model = new PizzaModel(record);
            var options = {success:new Function};
            spyOn(options,'success').andCallThrough();
            PizzaStore.save(record).done(function(){
                PizzaManager.update(model,options).done(function(){
                    expect(options.success).toHaveBeenCalled();
                    // Todo: check args passed 
                    done();
                })
            });
        });
        async.it("calls error with (xhr, status, thrown) before rejecting",function(done){
            var record = {id:1,secret:Offline.uuid()};
            var model = new PizzaModel(record);
            var options = {error:new Function};
            spyOn(options,'error').andCallThrough();
            PizzaManager.update(model,options).fail(function(){
                expect(options.error).toHaveBeenCalled();
                // Todo: check args passed 
                done();
            })
        });
        async.it("calls Store.get with id and then Store.save with record",function(done){
            var record = {id:1,secret:Offline.uuid()};
            spyOn(PizzaStore,'get').andCallFake(function(){
               return $.Deferred().resolve(record).promise();
            });
            spyOn(PizzaStore,'save').andCallThrough();
            var model = new PizzaModel(record);
            model.set({key:Offline.uuid()});
            PizzaManager.update(model).done(function(){
                expect(PizzaStore.get).toHaveBeenCalled();
                expect(PizzaStore.get.calls.length).toEqual(1);
                expect(PizzaStore.save).toHaveBeenCalled();
                expect(PizzaStore.save.calls.length).toEqual(1);
                expect(PizzaStore.get).toHaveBeenCalledWith(record.id);
                expect(PizzaStore.save).toHaveBeenCalledWith(PizzaManager.toRecord(model));
                done();
            })

        });
    });

    describe("delete method Test Suite",function(){
        async.it("calls store.save() with _deleted=true",function(done){
            var model = new PizzaModel({id:1,secret:Offline.uuid()});
            spyOn(PizzaStore,'save').andCallThrough();
            PizzaManager.delete(model).done(function(){
                expect(PizzaStore.save).toHaveBeenCalled();
                expect(PizzaStore.save.calls.length).toEqual(1);
                var args = PizzaStore.save.mostRecentCall.args;
                expect(args.length).toEqual(1);
                expect(args[0].id).toEqual(model.get('id'));
                expect(args[0].secret).toEqual(model.get('secret'));
                expect(args[0]._deleted).toBeTruthy();
                expect(args[0]._dirty).not.toBeTruthy();
                done();
            });
        });
        async.it("calls success with (resp, status, xhr) before resolving",function(done){
            var record = {id:1,secret:Offline.uuid()};
            var model = new PizzaModel(record);
            var options = {success:new Function};
            spyOn(options,'success').andCallThrough();
            PizzaStore.save(record).done(function(){
                PizzaManager.delete(model,options).done(function(){
                    expect(options.success).toHaveBeenCalled();
                    // Todo: check args passed 
                    done();
                })
            });
        });
        async.it("calls error with (xhr, status, thrown) before rejecting",function(done){
            var record = {id:1,secret:Offline.uuid()};
            var model = new PizzaModel(record);
            var options = {error:new Function};
            spyOn(options,'error').andCallThrough();
            spyOn(PizzaStore,'save').andCallFake(function(){
                return $.Deferred().reject().promise();
            });

            PizzaManager.delete(model,options).fail(function(){
                expect(options.error).toHaveBeenCalled();
                // Todo: check args passed
                done();
            })
        });
    });

    describe("read method Test Suite for Model",function(){
        async.it("calls success with (resp, status, xhr) before resolving",function(done){
            var record = {id:1,secret:Offline.uuid()};
            var model = new PizzaModel({id:record.id});
            var options = {success:new Function};
            spyOn(options,'success').andCallThrough();
            spyOn(PizzaStore,'get').andCallFake(function(){
                return $.Deferred().resolve(record).promise();
            });
            PizzaManager.read(model,options).done(function(){
                    expect(options.success).toHaveBeenCalled();
                    // Todo: check args passed
                    done();
                })
        });
        async.it("calls error with (xhr, status, thrown) before rejecting",function(done){
            var options = {error:new Function};
            spyOn(options,'error').andCallThrough();
            spyOn(PizzaStore,'get').andCallFake(function(){
                return $.Deferred().reject().promise();
            });

            PizzaManager.read(new PizzaModel({id:1}),options).fail(function(){
                expect(options.error).toHaveBeenCalled();
                // Todo: check args passed
                done();
            })
        });
    });

    describe("read method Test Suite for Collection",function(){
        async.it("calls success with (resp, status, xhr) before resolving",function(done){
            var record = {id:1,secret:Offline.uuid()};
            var options = {success:new Function};
            spyOn(options,'success').andCallThrough();
            spyOn(PizzaStore,'find').andCallFake(function(){
                return $.Deferred().resolve([record]).promise();
            });
            PizzaManager.read(new PizzaCollection,options).done(function(){
                expect(options.success).toHaveBeenCalled();
                // Todo: check args passed
                done();
            })
        });
        async.it("calls error with (xhr, status, thrown) before rejecting",function(done){
            var options = {error:new Function};
            spyOn(options,'error').andCallThrough();
            spyOn(PizzaStore,'find').andCallFake(function(){
                return $.Deferred().reject().promise();
            });
            PizzaManager.read(new PizzaCollection,options).fail(function(){
                expect(options.error).toHaveBeenCalled();
                // Todo: check args passed
                done();
            })
        });
    });
    describe("updateRelated method test Suite",function(){});



////    async.it("create operation calls success before resolving promise",function(done){});
////    async.it("read operation calls success before resolving promise",function(done){});
////    async.it("delete operation calls success before resolving promise",function(done){});
//////    async.it("update operation calls success before resolving promise",function(done){});
//    async.it("create operation creates local record in store",function(done){
//        var pizza = new PizzaModel({name: _.uniqueId('pizza')});
//        spyOn(PizzaStore,'save').andCallThrough();
//        PizzaManager.create(pizza).done(function(){
//            var expectedArgs = PizzaManager.toRecord(pizza);
//            // expect manager to call save  on store
//            expect(PizzaStore.save).toHaveBeenCalledWith(expectedArgs);
//            // expect pizza id to be defined
//            expect(pizza.id).not.toBeUndefined();
//            // expect pizza to be local only
//            expect(PizzaSynchronizer.isLocal(pizza)).toBeTruthy();
//            done();
//        });
//    });
//    async.it("update operation updates record in store",function(done){
//        var record = {id:1,secret:Offline.uuid()};
//        var pizza = new PizzaModel(record);
//        PizzaStore.save(record).done(function(){
//            pizza.set({key:Offline.uuid()});
//            spyOn(PizzaStore,'save')
//            PizzaManager.update(pizza).done()
//        })
//    });
//    async.it("delete operation sets _deleted flag for record in store",function(done){});
//    async.it("read for Model operation return record from store",function(done){});
//    async.it("read for Collection operation returns records from store",function(done){})
//    async.it("create operation calls updateRelated",function(done){});
//    async.it("update operation calls updateRelated",function(done){});
//    async.it("delete operation calls updateRelated",function(done){});
//    async.it("updateRelated resolves relations",function(done){});
//    async.it("isConflicted returns true for conflicted model",function(done){});
//    async.it("isConflicted returns false for not conflicted model",function(done){});


});