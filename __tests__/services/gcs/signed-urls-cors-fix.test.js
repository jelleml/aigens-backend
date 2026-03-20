/**
 * Test per verificare le modifiche alle Signed URLs con CORS headers
 */

const GoogleCloudStorage = require('../../../services/google-cloud-storage.service');

describe('Signed URLs CORS Fix', () => {
  let gcsService;

  beforeEach(() => {
    // Mock della configurazione per i test
    jest.mock('../../../config/config', () => ({
      googleCloud: {
        projectId: 'test-project',
        bucketName: 'test-bucket',
        credentials: {
          client_email: 'test@test.com'
        }
      }
    }));

    gcsService = new GoogleCloudStorage();
  });

  describe('getSignedUrl method', () => {
    it('should include CORS headers in signed URL options', async () => {
      // Mock del bucket e file
      const mockFile = {
        exists: jest.fn().mockResolvedValue([true]),
        getSignedUrl: jest.fn().mockResolvedValue(['https://test-signed-url.com'])
      };

      const mockBucket = {
        file: jest.fn().mockReturnValue(mockFile)
      };

      gcsService.bucket = mockBucket;

      // Test della chiamata
      await gcsService.getSignedUrl('test-file.jpg', {
        contentType: 'image/jpeg'
      });

      // Verifica che getSignedUrl sia stato chiamato con le opzioni CORS
      expect(mockFile.getSignedUrl).toHaveBeenCalledWith({
        version: 'v4',
        action: 'read',
        expires: expect.any(Number),
        contentType: 'image/jpeg', // Ora incluso nelle opzioni
        query: {
          'response-content-type': 'image/jpeg',
          'response-content-disposition': 'inline'
        }
      });
    });

    it('should use default content type when not provided', async () => {
      const mockFile = {
        exists: jest.fn().mockResolvedValue([true]),
        getSignedUrl: jest.fn().mockResolvedValue(['https://test-signed-url.com'])
      };

      const mockBucket = {
        file: jest.fn().mockReturnValue(mockFile)
      };

      gcsService.bucket = mockBucket;

      await gcsService.getSignedUrl('test-file.jpg');

      expect(mockFile.getSignedUrl).toHaveBeenCalledWith({
        version: 'v4',
        action: 'read',
        expires: expect.any(Number),
        query: {
          'response-content-type': 'image/*',
          'response-content-disposition': 'inline'
        }
      });
    });
  });
});
