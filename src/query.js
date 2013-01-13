
Backbone.Query = function(data){
    /*
     Odpowiedzialne za implementacje wyszukiwania
     */
    this.filtersMatches = function(record,filters){
        if (filters.length == 0) return true;
        for(var i=0; i<filters.length; i++){
            var filter = filters[i];
            var value = record[filter.field];
            switch(filter.lookup){
                case 'exact':
                    if (value != filter.value) return false;
                    break;
                case 'lte':
                    if (value > filter.value) return false;
                    break;
                case 'lt':
                    if (value >= filter.value) return false;
                    break;
                case 'gte':
                    if (value < filter.value) return false;
                    break;
                case 'gt':
                    if (value <= filter.value) return false;
                    break;
                case 'in':
                    if (!_.contains(filter.value||[], value)) return false;
                    break;
                case 'between':
                    if (filter.value[0] > value || value > filter.value[1]) return false;
                    break;
                case 'exclude':
                    if (filter.value == value) return false;
                    break;
                case 'contains':
                    if (!_.contains(value, filter.value)) return false;
                    break;
            }
        }
        return true;
    }

    this.getFilters = function(data)    {
        data = _.omit(data,'order', 'limit', 'offset');
        var filters = _.map(_.keys(data), function(q){
            var tmp = q.split('__');
            return {
                field:tmp[0],
                value:data[q],
                lookup:tmp[1] || 'exact'
            };
        });
        return this.handleSpecialFilters(filters);
    };

    this.handleSpecialFilters = function(filters){
        return _.map(filters, function(filter){
            if (filter.field == 'deleted'){
                if (filter.value == true){
                    filter.value = 'true';
                } else if (filter.value == false){
                    filter.value = 'false'
                }
            }
            return filter
        })
    };

    this.matches= function(record){
        return this.filtersMatches(record, this.filters);
    }

    this.filters = this.getFilters(data);
}