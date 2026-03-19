import bcrypt from 'bcrypt';

async function generateHashes() {
  const passwords = [
    { user: 'agent1', password: 'Agent1234@' },
    { user: 'agent2', password: 'Agent2026!' },
    { user: 'superviseur', password: 'SuperviseurMapp@2026' }
  ];

  console.log('Generating bcrypt hashes...\n');

  for (const { user, password } of passwords) {
    const hash = await bcrypt.hash(password, 10);
    console.log(`${user}: ${password}`);
    console.log(`Hash: ${hash}\n`);
  }
}

generateHashes();
