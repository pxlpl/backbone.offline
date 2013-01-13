/*
    Utils required for some functions to work like:
        uuid generation         - for offline Model creation
        versioning              -
        fetch options cache     - for simpler View integration with Backbone.local sync events

 */

function S4() {
    return (((1 + Math.random()) * 0x10000) | 0).toString(16).substring(1);
}

function uuid() {
    return ("-"+ S4() + S4() + "-" + S4() + "-" + S4() + "-" + S4() + "-" + S4() + "-" + S4() + "-" + S4());
}

Backbone.Model.prototype.isNew = function(){
    return Synchronizer.isLocal(this);
};

var Singleton = _.extend({},{
    extend:function(staticAttrs){
        var singleton = {};
        _.extend(singleton, Backbone.Events, this, staticAttrs);
        singleton.super=this;
        return singleton;
    }
});