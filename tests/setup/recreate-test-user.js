const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const db = require('../../database');
const { User, Wallet } = db.sequelize.models;

async function recreateTestUser() {
    try {
        console.log('Starting user recreation process');

        // Delete existing user if found
        await User.destroy({
            where: { email: 'mr.simone.landi@gmail.com' }
        });
        console.log('Deleted any existing user with that email');

        // Create a new user with known password
        const password = '!81ria79J';
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        console.log('Creating new user...');
        const userId = uuidv4();
        const user = await User.create({
            id: userId,
            email: 'mr.simone.landi@gmail.com',
            password: hashedPassword,
            first_name: 'Simone',
            last_name: 'Landi',
            is_email_verified: true,
            is_active: true,
            role: 'admin'
        });

        console.log('User created successfully');
        console.log('User ID:', userId);

        // Create wallet for the user
        await Wallet.destroy({
            where: { user_id: userId }
        });

        await Wallet.create({
            user_id: userId,
            balance: 100.00,
            currency: 'USD'
        });

        console.log('Wallet created successfully');

        // Verify the password hash is stored correctly
        const dbUser = await User.findByPk(userId);
        console.log('Stored password hash:', dbUser.password);

        // Verify bcrypt compare works
        const isValid = await bcrypt.compare(password, dbUser.password);
        console.log('Password validation test:', isValid ? 'SUCCESS' : 'FAILURE');

        console.log('Test user ready. Email: mr.simone.landi@gmail.com, Password: !81ria79J');
        process.exit(0);
    } catch (error) {
        console.error('Error recreating test user:', error);
        process.exit(1);
    }
}

recreateTestUser(); 