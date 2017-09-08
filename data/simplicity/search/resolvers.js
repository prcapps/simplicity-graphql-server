const axios = require('axios');
function searchCivicAddressId(searchString, context) {
  const pool = context.pool;
  const myQuery = 'SELECT civicaddress_id, pinnum, address from coagis.bc_address'
  + `where cast(civicaddress_id as TEXT) LIKE '${searchString}%'  limit 5`;
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
}

function searchAddress(searchString, searchContext, context) {
  // const geolocatorUrl = 'http://192.168.0.125:6080/arcgis/rest/services/Geolocators/BC_address_unit/GeocodeServer/findAddressCandidates'
  const geolocatorUrl = 'http://arcgis.ashevillenc.gov/arcgis/rest/services/Geolocators/BC_address_unit/GeocodeServer/findAddressCandidates'
  + '?Street=&City=&ZIP='
  + `&Single+Line+Input=${encodeURIComponent(searchString)}&category=`
  + '&outFields=House%2C+PreDir%2C+StreetName%2C+SufType%2C+SubAddrUnit%2C+City%2C+ZIP'
  + '&maxLocations=&outSR=&searchExtent='
  + '&location=&distance=&magicKey=&f=pjson';
  console.log('Making the call');
  console.log(geolocatorUrl);
  return axios.get(geolocatorUrl, { timeout: 5000 })
  .then(response => {
    console.log(`Got a total of ${response.data.candidates.length} responses`);
    // console.log(JSON.stringify(response.data.candidates));
    const candidates = response.data.candidates.filter(c => {
      return (c.score > 50);
    });

    const uniqueStreets = candidates.reduce((accum, curr) => {
      if (accum.indexOf(curr.attributes.StreetName) < 0) accum.push(curr.attributes.StreetName);
      return accum;
    }, []);
    const locNumber = [];
    const locName = [];
    const locType = [];
    const locPrefix = [];
    const locUnit = [];
    const locZipcode = [];
    const locCity = [];
    candidates.forEach((c, i) => {
      if (i < 11) {
        locNumber.push(c.attributes.House);
        locName.push(c.attributes.StreetName);
        locType.push(c.attributes.SufType);
        locPrefix.push(c.attributes.PreDir);
        locUnit.push(c.attributes.SubAddrUnit);
        locZipcode.push(c.attributes.ZIP);
        locCity.push(c.attributes.City);
      }
    });
    // locNumber = [283843];
    // locName = ['SALEM'];
    console.log(`UniqueStreets: ${uniqueStreets}`); // 283843
    const fquery = 'SELECT civicaddress_id, address_full, address_city, address_zipcode, '
    + 'address_number, address_unit, address_street_prefix, address_street_name '
    + 'from amd.get_all_foo($1, $2, $3, $4, $5, $6, $7)';
   // console.log(`Here is the query: ${fquery}`);
    const args = [locNumber, locName, locType, locPrefix, locUnit, locZipcode, locCity];
   // console.log(`Here are the args: ${JSON.stringify(args)}`);
    return context.pool.query(fquery, args)
    .then(result => {
      console.log(`RESULT: ${JSON.stringify(result.rows)}`);
    })
    .catch(error => {
      console.log(`Got an error: ${JSON.stringify(error)}`);
      throw new Error(error);
    });

    return Promise.all(candidates.map(a => {
      const pool = context.pool;
      let myQuery = 'SELECT civicaddress_id, address_full, address_city, address_zipcode, '
      + 'address_number, address_unit, address_street_prefix, address_street_name '
      + 'FROM amd.coa_bc_address_master WHERE '
      + `address_number = '${a.attributes.House}' `
      + `AND address_street_name = '${a.attributes.StreetName}' `
      + `AND address_street_type = '${a.attributes.SufType}' `
      + `AND address_commcode = '${a.attributes.City}' AND `
      + `address_zipcode = '${a.attributes.ZIP}' `;
      if (a.attributes.SubAddrUnit !== null && a.attributes.SubAddrUnit !== '') {
        myQuery += `AND address_unit = '${a.attributes.SubAddrUnit}' `;
      } else {
        myQuery += `AND (trim(BOTH FROM address_unit) = '${a.attributes.SubAddrUnit}' OR address_unit IS NULL) `;
      }
      if (a.attributes.PreDir !== null && a.attributes.PreDir !== '') {
        myQuery += `AND address_street_prefix = '${a.attributes.PreDir}' `;
      } else {
        myQuery += `AND (trim(BOTH FROM address_street_prefix) = '${a.attributes.PreDir}' OR address_street_prefix IS NULL) `;
      }
      // console.log(myQuery);
      return pool.query(myQuery)
      .then(result => {
//        console.log(`Back with query with ${result.rows.length} rows`);
        return {
          items: result.rows.map(row => {
            return {
              score: a.score,
              type: 'address',
              civic_address_id: row.civicaddress_id,
              address: row.address_full,
              street_name: row.address_street_name,
              street_prefix: row.address_street_prefix,
              street_number: row.address_number,
              unit: row.address_unit,
              city: row.address_city,
              zipcode: row.address_zipcode,
            };
          }),
        };
      });
    }))
    .then(clist => {
      const result = {
        type: 'searchContext',
        results: clist.reduce((prev, curr) => {
          return prev.concat(curr.items);
        }, []),
      };
      return Promise.resolve(result);
    });
  })
  .catch(error => {
    throw new Error(error);
  });
}

function performSearch(searchString, searchContext, context) {
  if (searchContext === 'civicAddressId') {
    return searchCivicAddressId(searchString, context);
  } else if (searchContext === 'address') {
    return searchAddress(searchString, searchContext, context);
  }
  throw new Error(`Unknown search context ${searchContext}`);
}

const resolvers = {
  Query: {
    search(obj, args, context) {
      const searchString = args.searchString;
      const searchContexts = args.searchContexts;
      return Promise.all(searchContexts.map((searchContext) => {
        return performSearch(searchString, searchContext, context);
      }));
    },
  },
};

module.exports = resolvers;
