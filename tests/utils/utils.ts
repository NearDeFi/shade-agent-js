import Docker from 'dockerode';

// Function to check if a transaction was successful
export function isTransactionSuccessful(transactionResult: any): boolean {
    try {
        // Check the final_execution_status (built-in near-sandbox property)
        const finalStatus = transactionResult?.final_execution_status;
        if (finalStatus === "EXECUTED_OPTIMISTIC" || finalStatus === "EXECUTED") {
            return true;
        }
        
        // Check transaction_outcome status
        const txOutcomeStatus = transactionResult?.transaction_outcome?.outcome?.status;
        if (txOutcomeStatus?.SuccessReceiptId) {
            return true;
        }
        
        // Check top-level status
        const topLevelStatus = transactionResult?.status;
        if (topLevelStatus?.SuccessValue === '') {
            return true;
        }
        
        return false;
    } catch (error) {
        console.error('Error checking transaction status:', error);
        return false;
    }
}

// Stop the API image using Docker SDK
export async function stopContainer(port: number = 3140): Promise<boolean> {
    try {
        const docker = new Docker();
        
        // List all containers
        const containers = await docker.listContainers({ all: true });
        
        // Find container using the specified port
        const targetContainer = containers.find(container => {
            return container.Ports?.some(portMapping => 
                portMapping.PublicPort === port
            );
        });
        
        if (targetContainer) {
            const container = docker.getContainer(targetContainer.Id);
            await container.stop();
            return true;
        } else {
            return true;
        }
    } catch (error) {
        console.warn(`WARNING: Error stopping container on port ${port}:`, error);
        return false;
    }
}

// Run the API locally using Docker SDK
export async function runApiLocally(dockerTag: string, apiCodehash: string = 'latest', port: number = 3140): Promise<boolean> {
    try {
        const docker = new Docker();
        
        // Stop any existing container first
        await stopContainer(port);
        
        // Create container configuration
        const imageName = apiCodehash === 'latest' 
            ? `${dockerTag}:latest` 
            : `${dockerTag}@sha256:${apiCodehash}`;
        
        // Read environment variables from .env file
        const envVars: string[] = [];
        try {
            const envContent = require('fs').readFileSync('./tests/.env.development.local', 'utf8');
            const envLines = envContent.split('\n').filter(line => line.trim() && !line.startsWith('#'));
            envVars.push(...envLines);
        } catch (error) {
            console.warn('Could not read .env.development.local file:', error.message);
        }
        
        // Add PORT environment variable
        envVars.push(`PORT=${port}`);
        
        const containerConfig = {
            Image: imageName,
            Env: envVars,
            ExposedPorts: {
                [`${port}/tcp`]: {}
            },
            HostConfig: {
                PortBindings: {
                    [`${port}/tcp`]: [{ HostPort: `${port}` }]
                },
                Platform: 'linux/amd64',
                AutoRemove: true
            }
        };
        
        // Create and start the container
        const container = await docker.createContainer(containerConfig);
        await container.start();
                
        // Log container output for debugging
        container.logs({ follow: true, stdout: true, stderr: true }, (err, stream) => {
            if (stream) {
                stream.on('data', (chunk) => {
                    console.log('Container log:', chunk.toString());
                });
            }
        });
        
        // Wait for the container to be ready
        await new Promise(resolve => setTimeout(resolve, 30000));
        
        // Handle shutdown signals to stop the container
        const cleanup = async () => {
            try {
                await container.stop();
            } catch (error) {
                console.warn('Error stopping container:', error);
            }
            process.exit(0);
        };
        
        process.on('SIGINT', cleanup);
        process.on('SIGTERM', cleanup);
        
        return true;
    } catch (error) {
        console.log('Error running API locally:', error);
        return false;
    }
}
