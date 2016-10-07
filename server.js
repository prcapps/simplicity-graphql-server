import express from 'express';
import { apolloExpress, graphiqlExpress } from 'apollo-server';
import bodyParser from 'body-parser';
import cors from 'cors';
import { createServer } from 'http';
import { SubscriptionServer } from 'subscriptions-transport-ws';
var pg = require('pg');
const Pool = pg.Pool;

import { subscriptionManager } from './data/subscriptions';
import schema from './data/schema';

// DATABASE_URL: :@:5432/

var dbConfig = {
  host: 'ec2-54-235-65-139.compute-1.amazonaws.com',
  user: 'jluztmsoizdhar',
  password: 'bWkhrp2UQSX2bJGcH4Zzgy_PY1',
  database: 'd324d1u5enjpd',
  ssl: true
};

var pool = new Pool(dbConfig);

const GRAPHQL_PORT = 8080;
const WS_PORT = 8090;

const graphQLServer = express().use('*', cors());

graphQLServer.use('/graphql', bodyParser.json(), apolloExpress({
  schema,
  context: {
    pool
  },
}));


graphQLServer.use('/graphiql', graphiqlExpress({
  endpointURL: '/graphql',
}));

graphQLServer.listen(GRAPHQL_PORT, () => console.log(
  `GraphQL Server is now running on http://localhost:${GRAPHQL_PORT}/graphql`
));

// WebSocket server for subscriptions
const websocketServer = createServer((request, response) => {
  response.writeHead(404);
  response.end();
});

websocketServer.listen(WS_PORT, () => console.log( // eslint-disable-line no-console
  `Websocket Server is now running on http://localhost:${WS_PORT}`
));

// eslint-disable-next-line
new SubscriptionServer(
  { subscriptionManager },
  websocketServer
);
