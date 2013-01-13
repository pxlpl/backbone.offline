describe("Manager & Store integration Test Suite",function(){
    var async = new AsyncSpec(this);
    async.beforeEach(connectTestDB);
    async.afterEach(clearTestDB);
    async.it("Manager.read() can fetch dirty and not dirty records (Collection)",function(done){
        var collection = new PizzaCollection;
        var existing = [
            {id:1,secret:Offline.uuid()},
            {id:2,secret:Offline.uuid()}
        ];
        var dirty = [
            {secret:Offline.uuid()},
            {secret:Offline.uuid()}
        ];
        $.when.apply($, _.map(existing,function(record){
            return PizzaStore.save(record);
        }).concat(_.map(dirty,function(record){
            return new PizzaModel(record).save();
        }))).done(function(){
            collection.fetch().done(function(){
                expect(collection.length).toEqual(4);
                var local = collection.filter(Synchronizer.isLocal);
                expect(local.length).toEqual(dirty.length);
                var remote = collection.reject(Synchronizer.isLocal);
                expect(remote.length).toEqual(existing.length);
                done();
            });
        });
    })
});
