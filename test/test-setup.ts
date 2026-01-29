process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = `postgresql://${process.env.DB_TEST_USERNAME || 'cinema'}:${process.env.DB_TEST_PASSWORD || 'cinema123'}@${process.env.DB_TEST_HOST || 'localhost'}:${process.env.DB_TEST_PORT || '5432'}/${process.env.DB_TEST_NAME || 'cinema_tickets_test'}`;
jest.setTimeout(60000);
