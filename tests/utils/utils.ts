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
            console.log(`Container ${targetContainer.Id} stopped successfully`);
            return true;
        } else {
            console.log(`No container found on port ${port}`);
            return true; // Not an error if no container to stop
        }
    } catch (error) {
        console.warn(`WARNING: Error stopping container on port ${port}:`, error);
        return false;
    }
}

// Run the API locally using Docker SDK
export async function runApiLocally(dockerTag: string, apiCodehash: string, port: number = 3140): Promise<boolean> {
    try {
        const docker = new Docker();
        
        // Stop any existing container first
        await stopContainer(port);
        
        // Create container configuration
        const containerConfig = {
            Image: `${dockerTag}@sha256:${apiCodehash}`,
            Env: [`PORT=${port}`],
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
        
        console.log(`Container started successfully on port ${port}`);
        
        // Wait for the container to be ready
        console.log('Waiting for API to be ready...');
        await waitForApi(port, 30000); // Wait up to 30 seconds
        
        // Handle shutdown signals to stop the container
        const cleanup = async () => {
            console.log('Stopping container...');
            try {
                await container.stop();
                console.log('Container stopped successfully');
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

// Wait for API to be ready by polling the health endpoint
async function waitForApi(port: number, timeoutMs: number = 30000): Promise<void> {
    const startTime = Date.now();
    const pollInterval = 1000; // Poll every 1 second
    
    while (Date.now() - startTime < timeoutMs) {
        try {
            const response = await fetch(`http://localhost:${port}/`);
            if (response.ok) {
                console.log('✅ API is ready!');
                return;
            }
        } catch (error) {
            // API not ready yet, continue waiting
        }
        
        console.log('⏳ API not ready yet, waiting...');
        await new Promise(resolve => setTimeout(resolve, pollInterval));
    }
    
    throw new Error(`API failed to start within ${timeoutMs}ms`);
}

