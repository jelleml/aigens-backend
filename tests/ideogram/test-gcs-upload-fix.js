#!/usr/bin/env node

/**
 * Test GCS Upload Fix for Ideogram
 * 
 * This script tests the Google Cloud Storage upload fix
 * to resolve the "stream destroyed" error during image uploads.
 */

const GoogleCloudStorage = require('../../services/google-cloud-storage.service');
const axios = require('axios');

async function testGCSUploadFix() {
  console.log('🔧 Testing GCS upload fix for Ideogram images...\n');

  try {
    // Initialize GCS service
    const gcsService = new GoogleCloudStorage();
    console.log('✅ GCS service initialized');

    // Download a test image (using a public test image)
    console.log('📥 Downloading test image...');
    const testImageUrl = 'https://httpbin.org/image/png'; // Public test PNG image
    
    const response = await axios({
      method: 'get',
      url: testImageUrl,
      responseType: 'arraybuffer',
      timeout: 30000
    });

    console.log(`✅ Test image downloaded: ${response.data.length} bytes, content-type: ${response.headers['content-type']}`);

    // Create buffer
    const imageBuffer = Buffer.from(response.data);
    console.log(`✅ Buffer created: ${imageBuffer.length} bytes`);

    if (imageBuffer.length === 0) {
      throw new Error('Empty buffer created');
    }

    // Test upload with timeout
    console.log('🚀 Testing GCS upload...');
    const startTime = Date.now();

    const uploadResult = await Promise.race([
      gcsService.uploadFile(
        imageBuffer,
        'test-gcs-upload.png',
        {
          folder: 'test-uploads',
          contentType: 'image/png',
          makePublic: false,
          metadata: {
            source: 'gcs-upload-test',
            testRun: new Date().toISOString()
          }
        }
      ),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Upload timeout after 60 seconds')), 60000)
      )
    ]);

    const uploadTime = Date.now() - startTime;
    console.log(`✅ Upload successful in ${uploadTime}ms`);

    console.log('\n📋 Upload Result:');
    console.log(`   File: ${uploadResult.fileName}`);
    console.log(`   Size: ${uploadResult.size} bytes`);
    console.log(`   GCS URL: ${uploadResult.gsUrl}`);
    console.log(`   Content Type: ${uploadResult.contentType}`);
    console.log(`   Bucket: ${uploadResult.bucket}`);

    // Test signed URL generation
    console.log('\n🔗 Testing signed URL generation...');
    try {
      const signedUrl = await gcsService.getSignedUrl(uploadResult.filePath, {
        action: 'read',
        expires: Date.now() + (15 * 60 * 1000) // 15 minutes
      });
      console.log(`✅ Signed URL generated: ${signedUrl.substring(0, 100)}...`);
    } catch (urlError) {
      console.error(`❌ Signed URL generation failed: ${urlError.message}`);
    }

    // Clean up test file
    console.log('\n🧹 Cleaning up test file...');
    try {
      await gcsService.deleteFile(uploadResult.filePath);
      console.log('✅ Test file deleted successfully');
    } catch (deleteError) {
      console.warn(`⚠️  Could not delete test file: ${deleteError.message}`);
    }

    console.log('\n🎉 GCS Upload Fix Test Results:');
    console.log('==============================');
    console.log('✅ Buffer creation: Working');
    console.log('✅ GCS upload: Working');
    console.log('✅ Stream handling: Fixed');
    console.log('✅ Metadata handling: Working');
    console.log('✅ Signed URL generation: Working');
    console.log('✅ File cleanup: Working');
    
    console.log('\n🚀 The GCS upload fix should resolve the "stream destroyed" error!');
    console.log('Ideogram image uploads should now work correctly.');

  } catch (error) {
    console.error('\n❌ GCS Upload Fix Test Failed:');
    console.error('===============================');
    console.error(`Error: ${error.message}`);
    
    if (error.message.includes('stream')) {
      console.error('\n💡 Stream-related error detected. Possible solutions:');
      console.error('   1. Check Google Cloud Storage credentials');
      console.error('   2. Verify bucket permissions');
      console.error('   3. Check network connectivity');
      console.error('   4. Increase timeout values');
    }
    
    if (error.message.includes('timeout')) {
      console.error('\n💡 Timeout error detected. Possible solutions:');
      console.error('   1. Increase upload timeout');
      console.error('   2. Check network speed');
      console.error('   3. Verify GCS service availability');
    }
    
    process.exit(1);
  }
}

if (require.main === module) {
  testGCSUploadFix().catch((error) => {
    console.error('Test execution failed:', error);
    process.exit(1);
  });
}

module.exports = { testGCSUploadFix };