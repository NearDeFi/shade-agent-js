
Before running tests you need to build and push the docker image
cd docker-api
docker build --platform linux/amd64 -t pivortex/api-image:latest .
docker push pivortex/api-image

Build the contract
cd contracts/proxy
cargo near build non-reproducible-wasm


Grab the codehash and put it in the .env file 

run test
npx vitest tests/local/example.test.ts






test the docker build by itself (need to configure envs) 
cd tests
cd docker-api && docker run -p 3140:3140 --env-file .env.development.local pivortex/api-image:latest




kill port 3032
lsof -ti:3032 | xargs kill -9