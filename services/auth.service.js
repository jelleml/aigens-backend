const { User } = require('../database').sequelize.models;
const { Op } = require('sequelize');

class AuthService {
    /**
     * Generate a random 6-digit code
     * @returns {string} - 6-digit code
     */
    generateVerificationCode() {
        return Math.floor(100000 + Math.random() * 900000).toString();
    }

    /**
     * Set verification code for user
     * @param {string} userId - User ID
     * @param {string} code - Verification code
     * @param {number} expiryMinutes - Expiry time in minutes (default: 10)
     * @returns {Promise<Object>} - Updated user
     */
    async setVerificationCode(userId, code, expiryMinutes = 10) {
        const expiresAt = new Date();
        expiresAt.setMinutes(expiresAt.getMinutes() + expiryMinutes);

        return await User.update(
            {
                verification_code: code,
                verification_code_expires_at: expiresAt
            },
            {
                where: { id: userId }
            }
        );
    }

    /**
     * Set magic link code for user
     * @param {string} userId - User ID
     * @param {string} code - Magic link code
     * @param {number} expiryMinutes - Expiry time in minutes (default: 10)
     * @returns {Promise<Object>} - Updated user
     */
    async setMagicLinkCode(userId, code, expiryMinutes = 10) {
        const expiresAt = new Date();
        expiresAt.setMinutes(expiresAt.getMinutes() + expiryMinutes);

        return await User.update(
            {
                magic_link_code: code,
                magic_link_code_expires_at: expiresAt
            },
            {
                where: { id: userId }
            }
        );
    }

    /**
     * Verify verification code
     * @param {string} email - User email
     * @param {string} code - Verification code
     * @returns {Promise<Object>} - Verification result
     */
    async verifyCode(email, code) {
        const user = await User.findOne({
            where: {
                email,
                verification_code: code,
                verification_code_expires_at: {
                    [Op.gt]: new Date()
                }
            }
        });

        if (!user) {
            return {
                success: false,
                error: 'Codice non valido o scaduto'
            };
        }

        // Clear the code after successful verification
        await user.update({
            verification_code: null,
            verification_code_expires_at: null,
            is_email_verified: true
        });

        return {
            success: true,
            user
        };
    }

    /**
     * Verify magic link code
     * @param {string} email - User email
     * @param {string} code - Magic link code
     * @returns {Promise<Object>} - Verification result
     */
    async verifyMagicLinkCode(email, code) {
        const user = await User.findOne({
            where: {
                email,
                magic_link_code: code,
                magic_link_code_expires_at: {
                    [Op.gt]: new Date()
                }
            }
        });

        if (!user) {
            return {
                success: false,
                error: 'Codice non valido o scaduto'
            };
        }

        // Clear the code after successful verification
        await user.update({
            magic_link_code: null,
            magic_link_code_expires_at: null,
            last_login: new Date()
        });

        return {
            success: true,
            user
        };
    }

    /**
     * Cleanup expired codes
     * @returns {Promise<Object>} - Cleanup result
     */
    async cleanupExpiredCodes() {
        const now = new Date();

        const verificationResult = await User.update(
            {
                verification_code: null,
                verification_code_expires_at: null
            },
            {
                where: {
                    verification_code_expires_at: {
                        [Op.lt]: now
                    }
                }
            }
        );

        const magicLinkResult = await User.update(
            {
                magic_link_code: null,
                magic_link_code_expires_at: null
            },
            {
                where: {
                    magic_link_code_expires_at: {
                        [Op.lt]: now
                    }
                }
            }
        );

        return {
            verification_codes_cleared: verificationResult[0],
            magic_link_codes_cleared: magicLinkResult[0]
        };
    }

    /**
     * Get user by email with case-insensitive search
     * @param {string} email - User email
     * @returns {Promise<Object>} - User object
     */
    async findUserByEmail(email) {
        return await User.findOne({
            where: {
                email: {
                    [Op.iLike]: email
                }
            }
        });
    }
}

module.exports = new AuthService(); 