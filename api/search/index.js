const schema = `
  type SillyResult implements SearchResult {
    score: Int!
    type: String!
    id: ID!
    text: String!
  }

  type AddressResult implements SearchResult {
    score: Int!
    type: String!
    civic_address_id: String
    address: String
    street_name: String
    street_prefix: String
    street_number: String
    unit: String
    city: String
    zipcode: String
  }

  type PropertyResult implements SearchResult {
    score: Int!
    type: String!
    pinnum: String
    pin: String
    pinext: String
    address: String
    city: String
    zipcode: String
    civic_address_id: String
  }

  type StreetResult implements SearchResult {
    score: Int!
    type: String!
    full_street_name: String!
    zip_code: String
    centerline_ids: [Float]!    
  }

  type OwnerResult implements SearchResult {
    score: Int!
    type: String!
    name: String
    pinnums: [String]
  }
  
  type NeighborhoodResult implements SearchResult {
    score: Int!
    type: String!
    name: String!
    nbhd_id: String   
    abbreviation: String
    polygon: Polygon
  }

  interface SearchResult {
    type: String!
    score: Int!
  }

  type TypedSearchResult {
    type: String!
    results: [SearchResult]
  }
`;


const resolvers = require('./resolvers');
module.exports = {
  schema,
  resolvers,
};
