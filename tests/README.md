
Before running tests you need to build and push the docker image
cd docker-api
docker build --platform linux/amd64 -t pivortex/api-image:latest .
docker push pivortex/api-image


Grab the codehash and put it in the .env file 

run test
npx vitest tests/local/example.test.ts
