import { describe, it, expect } from 'vitest';

describe('Example Test', () => {
    it('should say hello test', () => {
        console.log('Hello test!');
        expect(true).toBe(true);
    });

    it('should respond with app is running', async () => {
        const response = await fetch('http://localhost:3140/');
        const data = await response.json();

        console.log(data);
        expect(response.status).toBe(200);
        expect(data.message).toBe('App is running');
    });
});
