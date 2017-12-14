const convertToPolygons = require('../common/convert_to_polygons').convertToPolgyons;
const axios = require('axios');

function searchCivicAddressId(searchString, context) {
  const pool = context.pool;
  const myQuery = 'SELECT civicaddress_id, property_pinnum, address_full '
  + 'FROM amd.coa_bc_address_master '
  + `WHERE cast(civicaddress_id as TEXT) = '${searchString}'  limit 5`;
  return pool.query(myQuery)
  .then((result) => {
    if (result.rows.length === 0) return { type: 'civicAddressId', results: [] };

    const finalResult = {
      type: 'civicAddressId',
      results: result.rows.map((address) => {
        return {
          score: 0,
          type: 'civicAddressId',
          id: address.civicaddress_id,
          civic_address_id: address.civicaddress_id,
          address: address.address_full,
          pinnum: address.property_pinnum,
          is_in_city: (address.jurisdiction_type === 'Asheville Corporate Limits'),
        };
      }),
    };
    return finalResult;
  })
  .catch((err) => {
    if (err) {
      console.log(`Got an error in searchCivicAddressID: ${JSON.stringify(err)}`);
      throw new Error(err);
    }
  });
}

function searchPin(searchString, context) {
  const myQuery = 'SELECT pin, pinext, address, cityname, zipcode FROM amd.bc_property '
  + `where cast(pin as TEXT) = '${searchString}' OR `
  + `cast(pinnum as TEXT) = '${searchString}' limit 5`;

  return context.pool.query(myQuery)
  .then(result => {
    if (result.rows.length === 0) return { type: 'pin', results: [] };

    const finalResult = {
      type: 'pin',
      results: result.rows.map(row => {
        return {
          score: 0,
          type: 'pin',
          pinnum: row.pin,
          pinnumext: row.pinext,
          address: row.address,
          city: row.city,
          zipcode: row.zipcode,
        };
      }),
    };
    return finalResult;
  })
  .catch((err) => {
    if (err) {
      console.log(`Got an error in searchPin: ${JSON.stringify(err)}`);
      throw new Error(err);
    }
  });
}

function searchNeighborhood(searchString, context) {
  const myQuery = 'SELECT name, nbhd_id, abbreviation, narrative, '
  + 'st_astext(st_transform(shape, 4326)) AS polygon '
  + 'FROM amd.coa_asheville_neighborhoods '
  + `where name ILIKE '%${searchString}%' AND narrative IN ('Active', 'In transition')`;
  console.log(myQuery);
  return context.pool.query(myQuery)
  .then(result => {
    if (result.rows.length === 0) return { type: 'neighborhood', results: [] };

    const finalResult = {
      type: 'neighborhood',
      results: result.rows.map(row => {
        const p = convertToPolygons(row.polygon);
        return {
          score: 0,
          type: 'neighborhood',
          name: row.name,
          nbhd_id: row.nbhd_id,
          abbreviation: row.abbreviation,
          polygon: (p && p.length > 0) ? p[0] : null,
        };
      }),
    };
    return finalResult;
  })
  .catch((err) => {
    if (err) {
      console.log(`Got an error in searchNeighborhood: ${JSON.stringify(err)}`);
      throw new Error(err);
    }
  });
}

function searchOwner(searchString, context) {
  let query = 'SELECT formatted_owner_name, pinnum '
  + 'FROM amd.bc_property_pinnum_formatted_owner_names WHERE ';

  const substrings = searchString.split(' ');
  substrings.forEach((itm, index) => {
    query += `formatted_owner_name ILIKE '%${itm}%' `;
    if (index < substrings.length - 1) query += 'AND ';
  });
  return context.pool.query(query)
  .then(result => {
    if (result.rows.length === 0) return { type: 'neighborhood', results: [] };
    const nameMap = {};
    result.rows.forEach(itm => {
      if (!nameMap.hasOwnProperty(itm.formatted_owner_name)) {
        nameMap[itm.formatted_owner_name] = {
          score: 0,
          type: 'owner',
          name: itm.formatted_owner_name,
          pinnums: [itm.pinnum],
        };
      } else {
        nameMap[itm.formatted_owner_name].pinnums.push(itm.pinnum);
      }
    });
    const owners = [];
    for (const owner in nameMap) {
      if (nameMap.hasOwnProperty(owner)) {
        owners.push(nameMap[owner]);
      }
    }

    const finalResult = {
      type: 'owner',
      results: owners,
    };
    return finalResult;
  })
  .catch((err) => {
    if (err) {
      console.log(`Got an error in searchOwner: ${JSON.stringify(err)}`);
      throw new Error(err);
    }
  });
}

function searchProperty(searchString, geoCodeResponse, context) {
  if (geoCodeResponse.locName.length === 0) {
    return Promise.resolve(
      {
        type: 'searchContext',
        results: [],
      }
    );
  }

  const fquery = 'SELECT DISTINCT property_pinnum '
  + 'from amd.get_search_addresses($1, $2, $3, $4, $5, $6, $7)';

  const args = [
    geoCodeResponse.locNumber,
    geoCodeResponse.locName,
    geoCodeResponse.locType,
    geoCodeResponse.locPrefix,
    geoCodeResponse.locUnit,
    geoCodeResponse.locZipcode,
    geoCodeResponse.locCity,
  ];

  return context.pool.query(fquery, args)
  .then(result => {
    if (result.rows.length === 0) {
      return Promise.resolve([]);
    }
    const pinList = result.rows.map(row => {
      return `'${row.property_pinnum}'`;
    }).join(',');

    const pQuery = 'SELECT pin, pinext, address, cityname, zipcode FROM amd.bc_property '
    + `WHERE pinnum IN (${pinList})`;
    return context.pool.query(pQuery)
    .then(props => {
      return props.rows.map(row => {
        return {
          score: 0,
          type: 'property',
          pinnum: row.pin,
          pinnumext: row.pinext,
          address: row.address,
          city: row.city,
          zipcode: row.zipcode,
        };
      });
    })
    ;
  })
  .then(clist => {
    const result = {
      type: 'searchContext',
      results: clist,
    };
    return Promise.resolve(result);
  })
  .catch((err) => {
    if (err) {
      console.log(`Got an error in property search: ${JSON.stringify(err)}`);
      throw new Error(err);
    }
  });
}

function searchStreet(searchContext, searchString, geoCodeResponse, context) {
  const s = searchString.replace(/\./g, '').replace(/,/g, '').replace(/\s+/g, ' ');
  const fquery = 'SELECT centerline_id, full_street_name, lzip, rzip '
  + 'from amd.bc_street '
  + `where full_street_name ILIKE '%${s}%'`;
  console.log(fquery);
  const idMap = {};
  return context.pool.query(fquery)
  .then(result => {
    const r = [];
    result.rows.forEach(row => {
      let idx = `${row.full_street_name}.${row.lzip}`;
      if (!idMap.hasOwnProperty(idx)) {
        idMap[idx] = {
          score: 0,
          type: 'street',
          full_street_name: row.full_street_name,
          zip_code: row.lzip,
          centerline_ids: {},
        };
        idMap[idx].centerline_ids[row.centerline_id] = row.centerline_id;
      } else {
        idMap[idx].centerline_ids[row.centerline_id] = row.centerline_id;
      }
      if (row.lzip !== row.rzip) {
        idx = `${row.full_street_name}.${row.rzip}`;
        if (!idMap.hasOwnProperty(idx)) {
          idMap[idx] = {
            score: 0,
            type: 'street',
            full_street_name: row.full_street_name,
            zip_code: row.rzip,
            centerline_ids: {},
          };
          idMap[idx].centerline_ids[row.centerline_id] = row.centerline_id;
        } else {
          idMap[idx].centerline_ids[row.centerline_id] = row.centerline_id;
        }
      }
    });
    for (const k in idMap) {
      if (idMap.hasOwnProperty(k)) {
        idMap[k].centerline_ids = Object.keys(idMap[k].centerline_ids);
        r.push(idMap[k]);
      }
    }
    return r;
  })
  .then(clist => {
    const result = {
      type: 'street',
      results: clist,
    };
    return Promise.resolve(result);
  })
  .catch((err) => {
    if (err) {
      console.log(`Got an error in street search: ${JSON.stringify(err)}`);
      throw new Error(err);
    }
  });
}

function searchAddress(searchContext, searchString, geoCodeResponse, context) {
  if (geoCodeResponse.locName.length === 0) {
    return Promise.resolve(
      {
        type: 'address',
        results: [],
      }
    );
  }
  const fquery = 'SELECT A.civicaddress_id, A.address_full, A.address_city, A.address_zipcode, '
  + 'A.address_number, A.address_unit, A.address_street_prefix, A.address_street_name, '
  + 'A.centerline_id, B.full_street_name, B.lzip, B.rzip '
  + 'from amd.get_search_addresses($1, $2, $3, $4, $5, $6, $7) AS A '
  + 'LEFT OUTER JOIN amd.bc_street AS B on A.centerline_id = B.centerline_id ';
  const args = [
    geoCodeResponse.locNumber,
    geoCodeResponse.locName,
    geoCodeResponse.locType,
    geoCodeResponse.locPrefix,
    geoCodeResponse.locUnit,
    geoCodeResponse.locZipcode,
    geoCodeResponse.locCity,
  ];

  const idMap = {};
  return context.pool.query(fquery, args)
  .then(result => {
    if (searchContext === 'street') {
      const r = [];
      result.rows.forEach(row => {
        let idx = `${row.full_street_name}.${row.lzip}`;
        if (!idMap.hasOwnProperty(idx)) {
          idMap[idx] = {
            score: 0,
            type: 'street',
            full_street_name: row.full_street_name,
            zip_code: row.lzip,
            centerline_ids: {},
          };
          idMap[idx].centerline_ids[row.centerline_id] = row.centerline_id;
        } else {
          idMap[idx].centerline_ids[row.centerline_id] = row.centerline_id;
        }
        if (row.lzip !== row.rzip) {
          idx = `${row.full_street_name}.${row.rzip}`;
          if (!idMap.hasOwnProperty(idx)) {
            idMap[idx] = {
              score: 0,
              type: 'street',
              full_street_name: row.full_street_name,
              zip_code: row.rzip,
              centerline_ids: {},
            };
            idMap[idx].centerline_ids[row.centerline_id] = row.centerline_id;
          } else {
            idMap[idx].centerline_ids[row.centerline_id] = row.centerline_id;
          }
        }
      });
      for (const k in idMap) {
        if (idMap.hasOwnProperty(k)) {
          idMap[k].centerline_ids = Object.keys(idMap[k].centerline_ids);
          r.push(idMap[k]);
        }
      }
      return r;
    }
    // Search context is 'address'
    return result.rows.map(row => {
      return {
        score: 0,
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
    })
    .filter(row => {
      if (idMap.hasOwnProperty(row.civic_address_id)) return false;
      idMap[row.civic_address_id] = true;
      return true;
    })
    ;
  })
  .then(clist => {
    const result = {
      type: 'address',
      results: clist,
    };
    return Promise.resolve(result);
  })
  .catch((err) => {
    if (err) {
      console.log(`Got an error in address search: ${JSON.stringify(err)}`);
      throw new Error(err);
    }
  });
}

// Context options: address, pin, neighborhood, property,
//                  civicAddressId, street, owner, and google
function performSearch(searchString, searchContext, geoCodeResponse, context) {
  if (searchContext === 'civicAddressId') {
    return searchCivicAddressId(searchString, context);
  } else if (searchContext === 'pin') {
    return searchPin(searchString, context);
  } else if (searchContext === 'address') {
    return searchAddress(searchContext, searchString, geoCodeResponse, context);
  } else if (searchContext === 'property') {
    return searchProperty(searchString, geoCodeResponse, context);
  } else if (searchContext === 'street') {
    return searchStreet(searchContext, searchString, geoCodeResponse, context);
  } else if (searchContext === 'neighborhood') {
    return searchNeighborhood(searchString, context);
  } else if (searchContext === 'owner') {
    return searchOwner(searchString, context);
  }
  throw new Error(`Unknown search context ${searchContext}`);
}

function requestGeo(searchString) {
  const maxCandidates = 500;
  const minCandidateScore = 50;
  const geoLocator = 'BC_address_unit'; // BC_address_unit or BC_street_address
  const baseLocator = `http://arcgis.ashevillenc.gov/arcgis/rest/services/Geolocators/${geoLocator}/GeocodeServer/findAddressCandidates`;
  const geolocatorUrl = `${baseLocator}?Street=&City=&ZIP=`
  + `&Single+Line+Input=${encodeURIComponent(searchString)}&category=`
  + '&outFields=House%2C+PreDir%2C+StreetName%2C+SufType%2C+SubAddrUnit%2C+City%2C+ZIP'
  + '&maxLocations=&outSR=&searchExtent='
  + '&location=&distance=&magicKey=&f=pjson';

  return axios.get(geolocatorUrl, { timeout: 5000 })
  .then(response => {
    const candidates = response.data.candidates.filter(c => {
      return (c.score >= minCandidateScore);
    });
    const result = {
      locNumber: [],
      locName: [],
      locType: [],
      locPrefix: [],
      locUnit: [],
      locZipcode: [],
      locCity: [],
    };
    if (candidates.length === 0) {
      return Promise.resolve(result);
    }
    candidates.forEach((c, i) => {
      if (i < maxCandidates) {
        result.locNumber.push(c.attributes.House);
        result.locName.push(c.attributes.StreetName);
        result.locType.push(c.attributes.SufType);
        result.locPrefix.push(c.attributes.PreDir);
        result.locUnit.push(c.attributes.SubAddrUnit);
        result.locZipcode.push(c.attributes.ZIP);
        if (c.attributes.City === null || c.attributes.City === '') {
          // result.locCity.push('ASHE');
          result.locCity.push(c.attributes.City);
        } else {
          result.locCity.push(c.attributes.City);
        }
      }
    });
    return Promise.resolve(result);
  })
  .catch((err) => {
    if (err) {
      console.log(`Got an error in geocoder lookup: ${JSON.stringify(err)}`);
      throw new Error(err);
    }
  });
}

const resolvers = {
  Query: {
    search(obj, args, context) {
      const searchString = args.searchString;
      const searchContexts = args.searchContexts;
      let geoCodeResponse = Promise.resolve(null);
      if (searchContexts.indexOf('address') >= 0 ||
       searchContexts.indexOf('property') >= 0 ||
       searchContexts.indexOf('street') >= 0) {
        geoCodeResponse = requestGeo(searchString);
      }
      return geoCodeResponse.then(result => {
        return Promise.all(searchContexts.map((searchContext) => {
          console.log(`Perform search for context ${searchContext}`);
          const ret = performSearch(searchString, searchContext, result, context);
          return ret;
        }));
      })
      .catch((err) => {
        if (err) {
          console.log(`Got an error in search: ${err}`);
          throw new Error(err);
        }
      });
    },
  },

  NeighborhoodResult: {
    polygon(obj) {
      return obj.polygon;
    },
  },

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
      } else if (data.type === 'address') {
        return info.schema.getType('AddressResult');
      } else if (data.type === 'property') {
        return info.schema.getType('PropertyResult');
      } else if (data.type === 'pin') {
        return info.schema.getType('PropertyResult');
      } else if (data.type === 'street') {
        return info.schema.getType('StreetResult');
      } else if (data.type === 'neighborhood') {
        return info.schema.getType('NeighborhoodResult');
      } else if (data.type === 'owner') {
        return info.schema.getType('OwnerResult');
      }
      return info.schema.getType('SillyResult');
    },
  },
};

module.exports = resolvers;
