Strategy = function(synchronizer,global){
    this.synchronizer = synchronizer;
    this.global = global;
    this.status = global.of(synchronizer);
    this.related = _.map(synchronizer.relations,function(relation){
        return global.of(relation.model);
    });

    _.bindAll(this,'push','pull','patch','create','update','delete','run','diff','save','createProgress','updateProgress','deleteProgress','resolveConflicts')
};


Strategy.prototype.run = function(){
    // push
    $.when(this.readyToPush())
        .then(this.push);
    // pull
    $.when(this.readyToPull())
        .then(this.pull);
    
    // apply diff
    $.when(this.readyToPatch())
        .then(this.patch);

    // resolve conflicts
    $.when(this.readyToResolve())
        .pipe(this.resolveConflicts);

    var s = this.status;
    $.when(s.pull,s.push,s.patch,s.resolve).done(s.resolve);

};

Strategy.prototype.push = function(){
    this.synchronizer.fetchLocalChanges() 
        .done(function(records){
            this.toUpdate = _.filter(records, function (r) { return (!this.synchronizer.isLocal(r)) && (!r._deleted) }.bind(this)); 
            this.toCreate = _.filter(records, this.synchronizer.isLocal);
            this.toDelete = _.filter(records, function (r) { return (!this.synchronizer.isLocal(r)) && ( r._deleted) }.bind(this));

            $.when(this.readyToDelete())
                .pipe(this.delete)
                .progress(this.deleteProgress)
                .done(this.status.delete.resolve);

            $.when(this.readyToUpdate())
                .pipe(this.update)
                .progress(this.updateProgress)
                .done(this.status.update.resolve);

            $.when(this.readyToCreate())
                .pipe(this.create)
                .progress(this.createProgress)
                .done(this.status.create.resolve);
        }.bind(this));
    $.when(this.status.create,this.status.update,this.status.delete).done(this.status.push.resolve)
    
};

Strategy.prototype.pull = function(){
    this.synchronizer.fetchRemoteChanges()
        .done(function(records){
            this.toSave = records;

            this._markRecordsAsUpToDate(records);

            $.when(this.readyToDiff)
                .pipe(this.diff)
                .then(this.status.diff.resolve);

            $.when(this.readyToSave)
                .pipe(this.save)
                .then(this.status.pull.resolve);
        }.bind(this));
};


Strategy.prototype.readyToPush = function(){
    return true;
};
Strategy.prototype.readyToPull = function(){
    return $.when(this.status.update,this.status.delete,this.status.create);
};
Strategy.prototype.readyToCreate = function(){
    var after = _.map(this.synchronizer.after,function(model){
        return this.global.of(model);
    }.bind(this));
    return when(_.pluck(after,'create'));
};
Strategy.prototype.readyToDelete = function(){
    return true;
};
Strategy.prototype.readyToUpdate = function(){
    return when(_.pluck(this.related,'create').concat(this.status.create));
};
Strategy.prototype.readyToDiff = function(){
    return true;
};
Strategy.prototype.readyToPatch = function(){
    return when(_.pluck(this.related,'diff').concat(this.status.pull));
};
Strategy.prototype.create = function(){
    return this.synchronizer.createRecords(this.toCreate);
};
Strategy.prototype.delete = function(){
    return this.synchronizer.deleteRecords(this.toDelete);
};
Strategy.prototype.diff = function () {
    var dfd = $.Deferred();
    var records = this.toSave;

    if(!records.length){
        // to increase speed, we don't hit local Store if no records were fetched
        dfd.resolve();
    } else {

        var ids = _.pluck(records, 'id');

        /* compute Diffs from fetched records */
        this.synchronizer.store.find({id__in: ids})
            .done(function (previous) {
                var newDiffs = this.synchronizer.diffRecords(records, previous);

                this.global.differences.add(newDiffs);

                dfd.resolve(records);
            }.bind(this));
    }

    return dfd.promise();
};

Strategy.prototype.update = function(){
//    // check again if records that are fresh, realy need to be updated :O
//    var toUpdate = [];
//    _.each(this.toUpdate,function(record){
//        if(record._fresh){
//            this.synchronizer.resolveRelations(record);
//            var stripped = this.synchronizer.strip(_.clone(record));
//            if(!_.isEmpty(stripped)){
//                toUpdate.push(record);
//            }else{
//                // todo: should we add the changes to diff?
//                var diff = this.global.differences.get(this.synchronizer);
//                // make diff from stripped :O
//            }
//        }else{
//            toUpdate.push(record);
//        }
//    }.bind(this));
//
//    return this.synchronizer.updateRecords(toUpdate);
    return this.synchronizer.updateRecords(this.toUpdate);
};
Strategy.prototype.save   = function(){
    return this.synchronizer.saveRecords(this.toSave);
};
Strategy.prototype.createProgress = function(message){
    if (message.message == "error"){
        this.status.conflicts.create.push(message.record);
    }else{
        _.each(this.synchronizer.relations, function(relation){
            // flatten bo moze byc FK relation
            var ids = _.flatten([message.record[relation.relation]]);
            if(!_.isEmpty(ids)){
                _.each(ids,function(id){this.global.of(relation.model).replace.push(id)}.bind(this));    
            }

        }.bind(this));
    }

    // if record needs update
    if (message.update) {
        message.record._fresh = true;
        this.toUpdate.push(message.record);
    }

    // do not apply previously generated diff to records we have just obtained from the server
    if(message.message=='success'){
        // tutaj problem, bo jak nie ma after, to wrzucony zostal uuid do resolve (uuid2id)
        // i niepotrzebnie dwa razy update robimy tego rekordu - wolne
        this._markRecordsAsUpToDate([message.record]);
    }
};
Strategy.prototype.deleteProgress = function(message){};
Strategy.prototype.updateProgress = function(message){
    if (message.message == "error"){
        switch (message.reason){
            case "conflict":
            case "invalid" :
                this.status.conflicts.update.push(message.record);
                break;

            case "server error":
                console.log("Server error");
                break;
            
        }
    }
     // do not apply previously generated diff to records we have just obtained from the server
    if(message.message=='success'){
        delete (this.global.differences.get(this.synchronizer))[message.record.id];
    }
};
Strategy.prototype.readyToSave = function(){
    return this.status.of(this.synchronizer).diff;
};

Strategy.prototype.patch = function(){
    var diff = this.global.differences.get(this.synchronizer);
    var ids = _.map(_.unique(this.status.replace),Offline.uuid2id);
    $.when(
        this.synchronizer.applyDiff(diff),
        this.synchronizer.replaceUUIDsWithRealIDs(ids)
    ).then(this.status.patch.resolve)
};


Strategy.prototype.readyToResolve = function(){
    return this.status.patch;
};

Strategy.prototype.resolveConflicts = function(){
   return this.synchronizer.resolveConflicts(this.status.conflicts)
        .done(this.status.resolve.resolve);
                           
};

Strategy.prototype._markRecordsAsUpToDate = function(records){
    var ids = _.pluck(records, 'id');
    var diff = {};
    diff[this.synchronizer.store.name]=ids;
    this.global.differences.remove(diff);
    this.status.replace = _.difference(this.status.replace, ids);  
};



synchronize = function(which){
    var synchronizers = _.map(which, function(obj){ return Offline.lookup(obj).synchronizer});
    
    var allModels = _.union.apply(undefined, _.map(synchronizers, function(synchronizer){
        return _.pluck(synchronizer.relations, 'model');
    }).concat(which));

    var allSynchronizers = _.map(allModels, function(model){ return Offline.lookup(model).synchronizer });
    var notRunning = _.difference(allSynchronizers, synchronizers);


    var global = new Global(allSynchronizers);

    _.each(synchronizers, function(synchronizer){
        var strategy = Offline.lookup(synchronizer).strategy;
        new strategy(synchronizer, global).run();
    });


    _.each(notRunning, function(synchronizer){
        new PatchOnlyStrategy(synchronizer, global).run();
    });


    return global;
};

Differences =  function(){
    this.differences = {};
};

Differences.prototype.add=function(other){
    this.differences = concatDiffs(this.differences, other);
};

Differences.prototype.remove=function(other){
    _.each(other,function(ids,type){
        var d =  this.differences[type];
        if (!d){
            return;
        }
        if(_.isObject(ids)){
            ids = _.keys(ids);
        }
        _.each(ids,function(id){
            delete d[id];
        });
    }.bind(this));
};

Differences.prototype.get=function(model){
    return this.differences[Offline.hash(model)] || {};
};

Strategy.extend = Backbone.View.extend;


PatchOnlyStrategy = function(synchronizer,global){
    this.global = global;
    this.status = global.of(synchronizer);
    this.synchronizer = synchronizer;
};

_.extend(PatchOnlyStrategy.prototype,Strategy.prototype,{

    readyToPatch : function(){
        return when(_.invoke(this.related,'stage','diff'));
    },

    run : function(){
        this.status.create.resolve();
        this.status.update.resolve();
        this.status.delete.resolve();
        this.status.push.resolve();
        this.status.pull.resolve();
        this.status.diff.resolve();
        this.status.resolve.resolve();
        return $.when(this.readyToPatch())
            .pipe(this.patch.bind(this))
            .done(this.status.all.resolve);
    },

    readyToPush : function(){
        return $.Deferred().reject();
    }


});