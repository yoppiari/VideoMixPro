interface Config {
  API_BASE_URL: string;
  NODE_ENV: string;
  API_TIMEOUT: number;
}

const config: Config = {
  API_BASE_URL: process.env.REACT_APP_API_BASE_URL || 'http://localhost:3000/api',
  NODE_ENV: process.env.NODE_ENV || 'development',
  API_TIMEOUT: parseInt(process.env.REACT_APP_API_TIMEOUT || '10000'),
};

export default config;