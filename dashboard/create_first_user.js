const { createUser } = require('./db.js');

try {
  const user = createUser({
    name: 'Teste',
    email: 'teste@teste.com',
    password: '123456'
  });

  console.log('USER_CREATED');
  console.log(JSON.stringify(user, null, 2));
} catch (err) {
  console.error('ERROR:', err.message);
  process.exit(1);
}
