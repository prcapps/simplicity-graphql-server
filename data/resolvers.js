const searchCivicAddressId = function (searchString, context) {
  const pool = context.pool;
  const myQuery = `SELECT civicaddress_id, pinnum, address from coagis.bc_address where cast(civicaddress_id as TEXT) LIKE '${searchString}%'  limit 5`;
  return pool.query(myQuery)
    .then((result) => {
      if (result.rows.length === 0) return { type: 'civicAddressId', results: [] };

      const finalResult = {
        type: 'civicAddressId',
        results: result.rows.map((address) => {
          return {
            score: 33,
            type: 'civicAddressId',
            id: address.civicaddress_id,
            civic_address_id: address.civicaddress_id,
            address: address.address,
            pinnum: address.pinnum,
            is_in_city: (address.jurisdiction_type === 'Asheville Corporate Limits'),
          };
        }),
      };
      return finalResult;
    })
    .catch((err) => {
      if (err) {
        console.log(`Got an error in searchCivicAddressID: ${JSON.stringify(err)}`);
      }
    });
};

const performSearch = function (searchString, searchContext, context) {
  if (searchContext === 'civicAddressId') {
    return searchCivicAddressId(searchString, context);
  }
  return Promise.resolve({
    type: searchContext,
    results: [
      {
        score: 22,
        type: 'silly',
        id: 1,
        text: `search by ${searchContext}`,
      },
    ] }
  );
};

const localResolvers = {
  search(obj, args, context) {
    const searchString = args.searchString;
    const searchContexts = args.searchContexts;
    return Promise.all(searchContexts.map((searchContext) => {
      return performSearch(searchString, searchContext, context);
    }));
  },

  my_simplicity(obj, args, context) {
    if (context.loggedin) {
      return {
        email: context.email,
        groups: context.groups,
        subscriptions: context.subscriptions,
      };
    }
    return {
      email: 'none',
      groups: [],
      subscriptions: JSON.stringify({}),
    };
  },
};
const simplicityResolvers = require('./simplicity/resolvers');
const mdaResolvers = require('./mda/resolvers');
const queryResolvers = Object.assign(
  {},
  localResolvers,
  mdaResolvers,
  simplicityResolvers
);
const resolveFunctions = {
  Query: queryResolvers,

  TypedSearchResult: {
    type(obj) {return obj.type;},
    results(obj, args, context) {
      return obj.results;
    },
  },

  SearchResult: {
    __resolveType(data, context, info) {
      if (data.type === 'civicAddressId') {
        return info.schema.getType('AddressResult');
      }
      return info.schema.getType('SillyResult');
    },
  },

};

module.exports = resolveFunctions;
