Offline = new Function;

_.extend(Offline, Backbone.Events,{

    Singleton:Singleton,
//    Synchronizer:Synchronizer,
//    Manager:Manager,
//    Store:Store,
//    Strategy:Strategy,

    map: {},
    registry: [],

    local: function(method, model, options) {
        var manager = Offline.lookup(model).manager;
        return manager[method](model,options);
    },
    remote: Backbone.sync,
    before:function(){
        _.invoke(_.pluck(this.registry,'synchronizer'),'before');
    },

    incSync : function(synchronizers){
        return synchronize(synchronizers || _.pluck(Offline.registry,'synchronizer'));
    },

    fullSync : function(synchronizers){
        // TODO: implement this
        throw 'not implemented'
    },

    sync : function(){
        return this.incSync.apply(this,arguments);
    },

    hash:function(obj){
        return Offline.lookup(obj).store.name;
    },

    uuid:uuid,

    uuid2id : function(id){
        return Offline.map[id] || id;
    },

    register: function(config){
        var defaults = {
            store : MemoryStore.extend({name:_.uniqueId('store')}),
            synchronizer : Synchronizer.extend(),
            manager : Manager.extend(),
            strategy : Strategy.extend()
        } ;

        _.defaults(config,defaults);
        if(!config.model){
            throw 'Cannot register undefined model'
        }
        if(!config.collection){
            throw 'Cannot register undefined collection'
        }

        Offline.registry.push(config);
        config.store.connect();
        config.manager.store = config.store;
        config.manager.collection = config.collection;

        config.synchronizer.store = config.store;
        config.synchronizer.collection = config.collection;
        config.synchronizer.model = config.model;
        config.synchronizer.manager = config.manager;
        try{
            App.on('initialize:after', config.synchronizer.bindEvents, config.synchronizer);
            App.on('initialize:after', config.manager.bindEvents, config.manager);
        }catch(e){}
    },

    lookup:function(obj){
        for(var i in Offline.registry){
            var r = Offline.registry[i];
            if( obj instanceof r.model ||
                obj instanceof r.collection ||
                obj == r.synchronizer ||
                _.contains(_.values(r),obj)){
                return r
            }
        }
    }
});
Backbone.Offline = Offline;

Backbone.sync = function(method, model, options){
    var sync = Offline.remote;
    if(!options.remote || !!options.local){
        sync = Offline.local;
        if(method=='create'&&model.id){
            method='update';
        }
    }else{
        if(method=='update'&&Synchronizer.isLocal(model)){
            method='create';
        }
    }
    return sync(method,model,options);
};
