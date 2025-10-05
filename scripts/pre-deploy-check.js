#!/usr/bin/env node

/**
 * Pre-Deployment Validation Checklist
 * Run this before building Docker image for deployment
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const checks = [];
let failedChecks = 0;

console.log('🔍 VideoMixPro Pre-Deployment Validation\n');
console.log('='.repeat(50));
console.log('');

// Helper function to run a check
function runCheck(name, fn) {
  process.stdout.write(`${name}... `);
  try {
    const result = fn();
    if (result === false) {
      console.log('❌ FAILED');
      failedChecks++;
      return false;
    } else {
      console.log('✅ PASSED');
      return true;
    }
  } catch (error) {
    console.log('❌ ERROR');
    console.log(`   ${error.message}`);
    failedChecks++;
    return false;
  }
}

// Check 1: TypeScript builds without errors
runCheck('TypeScript Build', () => {
  try {
    execSync('npm run build', { stdio: 'pipe', encoding: 'utf8' });
    return true;
  } catch (error) {
    console.log('\n   Build output:');
    console.log(error.stdout || error.message);
    return false;
  }
});

// Check 2: Frontend builds successfully
runCheck('Frontend Build', () => {
  try {
    const frontendPath = path.join(__dirname, '..', 'frontend');
    execSync('npm run build', { cwd: frontendPath, stdio: 'pipe', encoding: 'utf8' });
    return true;
  } catch (error) {
    console.log('\n   Build output:');
    console.log(error.stdout || error.message);
    return false;
  }
});

// Check 3: Environment variables validated
runCheck('Environment Variables', () => {
  const requiredVars = ['DATABASE_PROVIDER', 'NODE_ENV', 'PORT', 'JWT_SECRET'];
  const productionEnvFile = path.join(__dirname, '..', '.env.production');

  if (!fs.existsSync(productionEnvFile)) {
    console.log('\n   Missing .env.production file');
    return false;
  }

  const envContent = fs.readFileSync(productionEnvFile, 'utf8');
  const missingVars = requiredVars.filter(varName => !envContent.includes(varName));

  if (missingVars.length > 0) {
    console.log(`\n   Missing variables: ${missingVars.join(', ')}`);
    return false;
  }

  return true;
});

// Check 4: Migration files valid
runCheck('PostgreSQL Migrations', () => {
  try {
    execSync('node scripts/validate-migrations.js', { stdio: 'pipe', encoding: 'utf8' });
    return true;
  } catch (error) {
    console.log('\n   Migration validation failed');
    console.log(error.stdout || error.message);
    return false;
  }
});

// Check 5: No debug endpoints in production code
runCheck('Debug Endpoints Guarded', () => {
  const indexFile = path.join(__dirname, '..', 'src', 'index.ts');
  const healthFile = path.join(__dirname, '..', 'src', 'routes', 'health.ts');

  const indexContent = fs.readFileSync(indexFile, 'utf8');
  const healthContent = fs.readFileSync(healthFile, 'utf8');

  // Check if debug endpoints are properly guarded
  const debugEndpoints = ['/api/emergency-login', '/api/test', '/api/debug-login', '/debug-env'];

  for (const endpoint of debugEndpoints) {
    if (indexContent.includes(endpoint) || healthContent.includes(endpoint)) {
      // Make sure it's inside a development check
      const hasGuard = indexContent.includes("process.env.NODE_ENV === 'development'") ||
                       healthContent.includes("process.env.NODE_ENV === 'development'");

      if (!hasGuard) {
        console.log(`\n   Debug endpoint ${endpoint} not properly guarded`);
        return false;
      }
    }
  }

  return true;
});

// Check 6: Database schema valid
runCheck('Prisma Schema', () => {
  const schemaFile = path.join(__dirname, '..', 'prisma', 'schema.prisma');

  if (!fs.existsSync(schemaFile)) {
    console.log('\n   schema.prisma not found');
    return false;
  }

  const schema = fs.readFileSync(schemaFile, 'utf8');

  // Check for required models
  const requiredModels = ['User', 'Project', 'Video', 'ProcessingJob'];
  const missingModels = requiredModels.filter(model => !schema.includes(`model ${model}`));

  if (missingModels.length > 0) {
    console.log(`\n   Missing models: ${missingModels.join(', ')}`);
    return false;
  }

  return true;
});

// Check 7: Dockerfile exists and is valid
runCheck('Dockerfile Valid', () => {
  const dockerfile = path.join(__dirname, '..', 'Dockerfile');

  if (!fs.existsSync(dockerfile)) {
    console.log('\n   Dockerfile not found');
    return false;
  }

  const content = fs.readFileSync(dockerfile, 'utf8');

  // Check for required sections
  const requiredSections = ['FROM node', 'COPY', 'RUN', 'CMD', 'EXPOSE'];
  const missingSections = requiredSections.filter(section => !content.includes(section));

  if (missingSections.length > 0) {
    console.log(`\n   Missing sections: ${missingSections.join(', ')}`);
    return false;
  }

  return true;
});

// Summary
console.log('');
console.log('='.repeat(50));
console.log('');

if (failedChecks === 0) {
  console.log('✅ All pre-deployment checks passed!');
  console.log('📦 Ready to build Docker image');
  console.log('');
  console.log('Next steps:');
  console.log('  1. Build: docker build -t videomixpro:latest .');
  console.log('  2. Test: docker run -d -p 3000:3000 videomixpro:latest');
  console.log('  3. Deploy: Push to Git and let Coolify rebuild');
  console.log('');
  process.exit(0);
} else {
  console.log(`❌ ${failedChecks} check(s) failed`);
  console.log('');
  console.log('Please fix the issues above before deploying');
  console.log('');
  process.exit(1);
}
