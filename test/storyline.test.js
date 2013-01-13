/*
##A


1. User ma nowy tablet, robi full sync

2. User wcześniej się synchronizował, nic nie zrobił, robi incSync

3. klient - zmiany, remote - brak zmian

4. klient- brak zmian, remote - nowe obiekty

5. klient -brak zmian, remote - zmiana obecnych obiektow

6. klient - zmiany, remote zmiany

*/

/*
##B

1. klient - zmiany (w relacjach), błąd walidacji. Fetch related po
update i zmiana (relacji), ktora chcielismy dodac juz nastapila.    np.
(Employee<--->Service -> serwer mowi Employee<--!-->Service),
fetchRemote(Service) mowi (Service<---->Employee) - co zrobic? - nie
wolno odkrecic relacji jesli powiazany obiekt przyszedl z restu po failu
z update
*/

xdescribe("storyline test",function(){
    var async = new AsyncSpec(this);
    beforeEach(function(){
        FakeRest = {
            "PizzaModel": {},
            "ToppingModel": {}
        };
    });

    async.beforeEach(connectTestDB);
    async.afterEach(clearTestDB);
	
	async.it("can handle conflicted updates & rollback relations",function(done){
		var pizza   = {id:1,name:"client pizza",toppings:[1],_dirty:true};
		var topping = {id:1,name:"client topping",pizzas:[pizza.id]};

		spyOn(PizzaSynchronizer,'updateRecord').andCallFake(function(record){
			// topping is not dirty, was updated by manager
		 	return $.Deferred().resolve({
                message: "error",
                record: {id:1,name:"server pizza"},
                reason: 'invalid'
            }).promise()
		});

		spyOn(PizzaSynchronizer,'fetchRemoteChanges').andCallFake(function(){
			return $.Deferred().resolve([]).promise()
		});
		spyOn(ToppingSynchronizer,'fetchRemoteChanges').andCallFake(function(){
			return $.Deferred().resolve([{id:1,name:"server topping",pizzas:[1]}]).promise();
		});	


		

		$.when(PizzaStore.save(pizza),ToppingStore.save(topping)).done(function(){
			synchronize([PizzaSynchronizer,ToppingSynchronizer]).all.done(function(){
				// revert relations
				$.when(PizzaStore.find(),ToppingStore.find()).done(function(pizzas,toppings){
					var topping = toppings[0];
					var pizza = pizzas[0];
					expect(topping.pizzas).toEqual([1]);
					expect(pizza.toppings).toEqual([1]);
					done()
				})
			});						
		})
	});


	async.it("can handle conflicted updates & rollback relations",function(done){
		var pizza   = {id:1,name:"client pizza",toppings:[1],_dirty:true};
		var topping = {id:1,name:"client topping",pizzas:[pizza.id]};

		spyOn(PizzaSynchronizer,'updateRecord').andCallFake(function(record){
			// topping is not dirty, was updated by manager
		 	return $.Deferred().resolve({
                message: "error",
                record: {id:1,name:"server pizza"},
                reason: 'invalid'
            }).promise()
		});

		spyOn(PizzaSynchronizer,'fetchRemoteChanges').andCallFake(function(){
			return $.Deferred().resolve([]).promise()
		});
		spyOn(ToppingSynchronizer,'fetchRemoteChanges').andCallFake(function(){
			return $.Deferred().resolve([{id:1,name:"server topping",pizzas:[]}]).promise();
		});	


		

		$.when(PizzaStore.save(pizza),ToppingStore.save(topping)).done(function(){
			synchronize([PizzaSynchronizer,ToppingSynchronizer]).all.done(function(){
				// revert relations
				$.when(PizzaStore.find(),ToppingStore.find()).done(function(pizzas,toppings){
					var topping = toppings[0];
					var pizza = pizzas[0];
					expect(topping.pizzas).toEqual([]);
					expect(pizza.toppings).toEqual([]);
					done()
				})
			});						
		})
	});

	async.it("can handle conflicted updates & rollback relations3",function(done){
		var pizza   = {id:1,name:"client pizza",toppings:[1],_dirty:true};
		var toppings = [
			{id:1,name:"client topping",pizzas:[pizza.id]},
			{id:2,name:"client topping",pizzas:[]},
			{id:3,name:"client topping",pizzas:[]}
		];

		spyOn(PizzaSynchronizer,'updateRecord').andCallFake(function(record){
			// topping is not dirty, was updated by manager
		 	return $.Deferred().resolve({
                message: "error",
                record: {id:1,name:"server pizza"},
                reason: 'invalid'
            }).promise()
		});

		spyOn(PizzaSynchronizer,'fetchRemoteChanges').andCallFake(function(){
			var dfd = $.Deferred();
			dfd.resolve([{id:1, name:"server pizza", toppings:[1,2,3]}]);
			return dfd.promise()
		});
		spyOn(ToppingSynchronizer,'fetchRemoteChanges').andCallFake(function(){
			var dfd = $.Deferred();
			dfd.resolve([]);
			return dfd.promise()

		});	


		

		$.when(PizzaStore.save(pizza), ToppingStore.saveMany(toppings)).done(function(){
			synchronize([PizzaSynchronizer,ToppingSynchronizer]).all.done(function(){
				// revert relations
				$.when(PizzaStore.find(),ToppingStore.find()).done(function(pizzas,toppings){
					var pizza = pizzas[0];
					_.each(toppings, function(topping){
						expect(topping.pizzas).toEqual([1]);	
					});
					expect(pizza.toppings).toEqual([1, 2, 3]);
					done()
				})
			});						
		})
	});
});


/*
2. klient mowi (Employee<---->Service), serwer mowi fail (Employee
<--!--> Service) trzeba odkrecic relacje.


##C

1. klient fetchuje tak długo aż wszystkie zmiany (Synchronizer) zwrócą 0
zmian - to zachodzi kiedy sa ciagle zmiany na serwerze, a potrzebny jest 
consistent state.



*/


/* optymalizujemy liczbe requestow
*  Topping after Pizzza -> (1. Pizza, 2. Topping)
*
* */

xdescribe('strategy request optimization test',function(){
    var async = new AsyncSpec(this);
    async.beforeEach(connectTestDB);
    async.afterEach(clearTestDB);

    async.it('uses only two queries when 2 related objects have to be created',function(done){
        var pizza = {id:uuid(),_dirty:true};
        var topping = {id:uuid(),pizzas:[pizza.id],_dirty:true};
        pizza.toppings = [topping.id];

        var resolve  =  function(){ return $.Deferred().resolve().promise()};

        spyOn(Offline,'rest').andCallFake(function(method,model,options){
            if(method=='create'){
                var record = model.toJSON();
                record.id = parseInt(_.uniqueId());
                options.success(record);
            }
            return resolve();
        });
        spyOn(PizzaSynchronizer,'createRecord').andCallThrough();
        spyOn(ToppingSynchronizer,'createRecord').andCallThrough();

        spyOn(PizzaSynchronizer,'updateRecord').andCallThrough();
        spyOn(ToppingSynchronizer,'updateRecord').andCallThrough();


        $.when(PizzaStore.save(pizza),ToppingStore.save(topping)).done(function(){
            synchronize([ToppingSynchronizer,PizzaSynchronizer]).all.done(function(){
                expect(PizzaSynchronizer.createRecord.calls.length).toEqual(1);
                expect(ToppingSynchronizer.createRecord.calls.length).toEqual(1);
                // this is where we fail
                expect(PizzaSynchronizer.updateRecord.calls.length + ToppingSynchronizer.updateRecord.calls.length).toEqual(0);
                expect(PizzaSynchronizer.updateRecord.calls.length).toEqual(0);
                expect(ToppingSynchronizer.updateRecord.calls.length).toEqual(0);
                done();
            });
        });

    });

});

