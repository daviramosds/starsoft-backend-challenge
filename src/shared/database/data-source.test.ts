import { DataSource, DataSourceOptions } from 'typeorm';

export const testDataSourceOptions: DataSourceOptions = {
  type: 'postgres',
  host: process.env.DB_TEST_HOST || 'localhost',
  port: parseInt(process.env.DB_TEST_PORT || '5432'),
  username: process.env.DB_TEST_USERNAME || 'cinema',
  password: process.env.DB_TEST_PASSWORD || 'cinema123',
  database: process.env.DB_TEST_NAME || 'cinema_tickets_test',
  entities: ['dist/entities/**/*.entity.js'],
  migrations: ['dist/migrations/**/*.js'],
  synchronize: true, // Auto-create tables in test environment
  dropSchema: true, // Drop all tables on each connection
  logging: process.env.NODE_ENV === 'development',
};

const testDataSource = new DataSource(testDataSourceOptions);

export default testDataSource;
