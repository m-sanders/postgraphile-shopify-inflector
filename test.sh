#!/bin/bash
set -e -x

docker-compose start

DATABASE_URL=postgres://root:postgres@localhost:5432/pg_shopify_inflectors

docker-compose exec db dropdb pg_shopify_inflectors || true
docker-compose exec db createdb pg_shopify_inflectors
docker-compose exec db psql pg_shopify_inflectors -f test.sql
npx postgraphile -c ${DATABASE_URL} -s app_public --simple-collections both -X --export-schema-graphql ./schema.graphql
npx postgraphile -c ${DATABASE_URL} -s app_public --simple-collections both -X --append-plugins "`pwd`/index.js" --export-schema-graphql ./schema.shopify.graphql
if command -v colordiff; then
  COLORDIFF="colordiff"
else
  COLORDIFF="cat"
fi;
diff -u ./schema.graphql ./schema.shopify.graphql | tee schema.graphql.diff | $COLORDIFF
