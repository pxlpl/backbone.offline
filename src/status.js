Global = function(synchronizers){

    this.status = {};
    this.differences = new Differences();

    _.each(synchronizers,function(synchronizer){
        var status = {
            create: $.Deferred(),
            update: $.Deferred(),
            delete: $.Deferred(),
            push: $.Deferred(),
            pull: $.Deferred(),
            diff: $.Deferred(),
            patch: $.Deferred(),
            resolve: $.Deferred(),

            conflicts: {
                create:[],
                update:[],
                delete:[]
            },

            replace:[]
        };
        status.all = when(_.values(status));
        this.status[Offline.hash(synchronizer)] = status;
    }.bind(this));


    this.all = when(_.pluck(this.status,'all'));
};

Global.prototype.of = function(what){
    return this.status[Offline.hash(what)];
};