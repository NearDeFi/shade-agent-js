import { readFileSync, writeFileSync } from 'fs';
import { execSync } from 'child_process';
import * as dotenv from 'dotenv';
if (process.env.NODE_ENV !== 'production') {
    // will load for browser and backend
    dotenv.config({ path: '../docker-api-test/.env.development.local' });
} else {
    // load .env in production
    dotenv.config();
}

async function main() {
    // restart docker service and all networking

    console.log('docker restarting...');
    try {
        execSync(`sudo systemctl restart docker`);
    } catch (e) {
        console.log('Error restart docker service', e);
        return;
    }
    console.log('docker restarted');

    // docker image build

    console.log('docker building image...');
    try {
        execSync(
            `sudo docker build --no-cache -t ${process.env.DOCKER_TAG}:latest .`,
        );
    } catch (e) {
        console.log('Error docker build', e);
        return;
    }
    console.log('docker image built');

    // docker hub push and get codehash

    console.log('docker pushing image...');
    let codehash;
    try {
        const output = execSync(`sudo docker push ${process.env.DOCKER_TAG}`);
        codehash = output.toString().match(/sha256:[a-f0-9]{64}/gim)[0];
    } catch (e) {
        console.log('Error docker push', e);
        return;
    }
    console.log('docker image pushed');

    // replace codehash in .env.development.local

    try {
        const path = '.env.development.local';
        const data = readFileSync(path).toString();
        const match = data.match(/APP_CODEHASH=[a-f0-9]{64}/gim)[0];
        const updated = data.replace(
            match,
            `APP_CODEHASH=${codehash.split('sha256:')[1]}`,
        );
        writeFileSync(path, updated, 'utf8');
    } catch (e) {
        console.log('Error replacing codehash in .env.development.local', e);
        return;
    }
    console.log('codehash replaced in .env.development.local');

    // replace codehash in docker-compose.yaml

    try {
        const path = 'docker-compose.yaml';
        const data = readFileSync(path).toString();
        const match = data.match(/@sha256:[a-f0-9]{64}/gim)[1];
        const updated = data.replace(match, `@${codehash}`);
        writeFileSync(path, updated, 'utf8');
    } catch (e) {
        console.log('Error replacing codehash in docker-compose.yaml', e);
        return;
    }
    console.log('codehash replaced in docker-compose.yaml');
}

main();
