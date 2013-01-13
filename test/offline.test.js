describe("Testing Offline registration", function(){
   var registry,
       model,
       collection,
       synchronizer,
       strategy,
       store;

    beforeEach(function(){
       model = Backbone.Model.extend();
       collection = Backbone.Collection.extend();
       store = Store.extend({name:'test'});
       strategy = Strategy.extend();
       synchronizer = Synchronizer.extend();
       registry = Offline.registry;
       Offline.registry = [];
   });
   afterEach(function(){
       Offline.registry = registry;
   });

   it('should register every provided argument',function(){
       Offline.register({
           model:model,
           collection:collection,
           store:store,
           strategy:strategy,
           synchronizer:synchronizer
       });
       var lookup = Offline.lookup(model);

       expect(lookup.model).toBe(model);
       expect(lookup.collection).toBe(collection);
       expect(lookup.store).toBe(store);
       expect(lookup.strategy).toBe(strategy);
       expect(lookup.synchronizer).toBe(synchronizer);
   });

    it('should provide defaults for manager',function(){
        Offline.register({
           model:model,
           collection:collection
        });
        var lookup = Offline.lookup(model);
        expect(lookup.manager).toBeDefined();
        expect(lookup.manager.store).toBeDefined();
    });

    it('should provide defaults for store',function(){
        Offline.register({
          model:model,
          collection:collection
        });
        var lookup = Offline.lookup(model);
        expect(lookup.store).toBeDefined();
    });

    it('should provide defaults for strategy',function(){
        Offline.register({
           model:model,
           collection:collection
        });
        var lookup = Offline.lookup(model);
        expect(lookup.strategy).toBeDefined();
    });

});