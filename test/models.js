JASMINE_TIMEOUT_INTERVAL = 500;

var TestStore = IndexedDBStore;
//var TestStore = MemoryStore;

var PizzaModel = Backbone.Model.extend({});
var ToppingModel = Backbone.Model.extend({});
var PizzaCollection = Backbone.Collection.extend({
    model: PizzaModel
});
var ToppingCollection = Backbone.Collection.extend({
    model: ToppingModel
});

var PizzaManager = Manager.extend({
    relations:[{model: ToppingModel, relation: "toppings", reverse: "pizzas",type:"m2m"}]
});

var ToppingManager = Manager.extend({
    relations:[{model: PizzaModel, relation: "pizzas", reverse: "toppings",type:"m2m"}]
});

PizzaStrategy = Strategy.extend();
ToppingStrategy = Strategy.extend({after:[PizzaModel]});


PizzaStore = TestStore.extend({name:'pizzas'});
ToppingStore = TestStore.extend({name:'toppings'});
ConflictsStore = TestStore.extend({name: "conflicts"});

PizzaSynchronizer = Synchronizer.extend({relations: PizzaManager.relations});
ToppingSynchronizer = Synchronizer.extend({relations: ToppingManager.relations});

Offline.register({
    model:PizzaModel,
    collection:PizzaCollection,
    manager:PizzaManager,
    store:PizzaStore,
    synchronizer:PizzaSynchronizer,
    strategy:PizzaStrategy
});
Offline.register({
    model:ToppingModel,
    collection:ToppingCollection,
    manager:ToppingManager,
    store:ToppingStore,
    synchronizer:ToppingSynchronizer,
    strategy:ToppingStrategy
});

var connectTestDB = function(done){
    $.when(ConflictsStore.connect(), ToppingStore.connect(), PizzaStore.connect()).done(done);
};

var clearTestDB = function(done){
    $.when(ConflictsStore.clear(), ToppingStore.clear(),PizzaStore.clear()).done(done);
};