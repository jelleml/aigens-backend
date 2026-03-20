const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const db = require('../../database');

async function createTestUser() {
    try {
        // Initialize database connection and models
        await db.initialize();
        console.log('Database connection established and models loaded');

        const password = '!81ria79J';
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const [user, created] = await db.models.User.findOrCreate({
            where: { email: 'mr.simone.landi@gmail.com' },
            defaults: {
                id: uuidv4(),
                email: 'mr.simone.landi@gmail.com',
                password: hashedPassword,
                first_name: 'Simone',
                last_name: 'Landi',
                is_email_verified: true,
                is_active: true,
                role: 'admin'
            }
        });

        if (created) {
            console.log('User created successfully');

            // Create wallet for the user if it was newly created
            await db.models.Wallet.findOrCreate({
                where: { user_id: user.id },
                defaults: {
                    user_id: user.id,
                    balance: 100.00,
                    currency: 'USD'
                }
            });

            console.log('Wallet created successfully');
        } else {
            console.log('User already exists');
            user.password = hashedPassword;
            await user.save();
            console.log('Password updated successfully');
        }

        console.log('Test user ready. Email: mr.simone.landi@gmail.com, Password: !81ria79J');
        process.exit(0);
    } catch (error) {
        console.error('Error creating test user:', error);
        process.exit(1);
    }
}

createTestUser(); 