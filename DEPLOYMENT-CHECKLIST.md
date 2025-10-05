# VideoMixPro - Deployment Checklist

## Pre-Deployment (Before Building)

### Code Quality
- [ ] All TypeScript errors fixed (`npm run build` succeeds)
- [ ] Frontend builds successfully (`cd frontend && npm run build`)
- [ ] No console errors or warnings
- [ ] All tests passing (if applicable)

### Configuration
- [ ] `.env.production` reviewed and updated
- [ ] Environment variables validated
- [ ] Debug endpoints properly guarded with `NODE_ENV` check
- [ ] No hardcoded credentials in code

### Database
- [ ] Migration files validated (`node scripts/validate-migrations.js`)
- [ ] PostgreSQL connection string correct
- [ ] Database backup created (if updating existing deployment)
- [ ] Schema changes reviewed

### Docker
- [ ] Dockerfile syntax valid
- [ ] All required dependencies in package.json
- [ ] `.dockerignore` properly configured
- [ ] Health check endpoint working locally

---

## Building (Before Deploying)

### Local Validation
- [ ] Run pre-deployment checks: `node scripts/pre-deploy-check.js`
- [ ] Build backend: `npm run build`
- [ ] Build frontend: `cd frontend && npm run build`
- [ ] Docker image builds: `docker build -t videomixpro:latest .`

### Docker Test (Optional but Recommended)
- [ ] Create test .env file with production values
- [ ] Run container locally: `docker run -p 3000:3000 --env-file .env.production videomixpro:latest`
- [ ] Test health endpoint: `curl http://localhost:3000/health`
- [ ] Test login: Try logging in with admin credentials
- [ ] Test database connection
- [ ] Stop test container

---

## Deploying (Production Deployment)

### Pre-Deploy Preparation
- [ ] Backup current database (if applicable)
- [ ] Tag current Docker image as backup: `docker tag videomixpro:latest videomixpro:backup`
- [ ] Note current Git commit hash for rollback
- [ ] Inform team about deployment (if applicable)

### Git Push
- [ ] Commit all changes: `git add .`
- [ ] Create meaningful commit message
- [ ] Push to repository: `git push origin main`
- [ ] Verify push successful

### Coolify Deployment
- [ ] Monitor Coolify build logs
- [ ] Watch for build errors
- [ ] Check deployment status
- [ ] Wait for healthcheck to pass

---

## Post-Deployment (After Container Starts)

### Health Checks
- [ ] Container is running (no crash loop)
- [ ] Health endpoint responds: `curl https://private.lumiku.com/health`
- [ ] No errors in container logs
- [ ] Database connection working

### Functional Tests
- [ ] Homepage loads correctly
- [ ] Login works with admin credentials
  - Email: admin@videomix.pro
  - Password: Admin123!
- [ ] Dashboard displays correctly
- [ ] Can create new project
- [ ] Video upload works (if testing)

### Performance
- [ ] Response time acceptable (< 2s for pages)
- [ ] No memory leaks (check container stats)
- [ ] CPU usage normal
- [ ] Database queries performing well

### Monitoring
- [ ] Set up alerts (if not already done)
- [ ] Monitor logs for first 30 minutes
- [ ] Check error rates
- [ ] Verify backup jobs running (if applicable)

---

## If Deployment Fails

### Immediate Actions
1. Check container logs: `docker logs <container_name>`
2. Check Coolify deployment logs
3. Verify environment variables are set correctly
4. Check database connectivity

### Common Issues

#### Container Keeps Restarting
- **Cause**: Database initialization failed
- **Fix**: Check DATABASE_URL, ensure PostgreSQL accessible
- **Logs**: Look for "Database timeout" or connection errors

#### Healthcheck Failing
- **Cause**: Backend not starting or nginx issue
- **Fix**: Check port 3002 is free, backend logs for errors
- **Logs**: Check supervisord logs

#### Migration Errors
- **Cause**: Migration conflicts or failed migrations
- **Fix**: Run `node scripts/fix-failed-migration.js` in container
- **Alternative**: Use `prisma db push` instead of migrate

#### Build Errors
- **Cause**: TypeScript or dependency issues
- **Fix**: Fix locally first, test with `npm run build`
- **Verify**: Run pre-deploy checks before building

### Rollback Procedure
If deployment is broken and can't be fixed quickly:

1. **Quick Rollback (Coolify)**:
   - Go to Coolify dashboard
   - Select previous deployment
   - Click "Rollback to this version"

2. **Git Rollback**:
   ```bash
   git revert HEAD
   git push
   # Wait for Coolify to rebuild
   ```

3. **Emergency Rollback Script**:
   ```bash
   ./scripts/rollback.sh
   ```

---

## Success Criteria

Deployment is considered successful when:

- ✅ Container runs for 5+ minutes without crashing
- ✅ Healthcheck passes consistently
- ✅ Login works
- ✅ Database queries work
- ✅ No critical errors in logs
- ✅ Application accessible at https://private.lumiku.com

---

## Post-Deployment Tasks

### Immediate (Within 1 hour)
- [ ] Verify all critical features working
- [ ] Check error logs for any issues
- [ ] Test user workflows
- [ ] Monitor resource usage

### Short-term (Within 24 hours)
- [ ] Update documentation with any changes
- [ ] Create deployment notes/changelog
- [ ] Share deployment status with team
- [ ] Schedule post-deployment review

### Maintenance
- [ ] Set up monitoring alerts
- [ ] Schedule regular database backups
- [ ] Plan for next deployment
- [ ] Document any issues encountered

---

## Emergency Contacts

- **Database Issues**: Check connection at 107.155.75.50:5986
- **Coolify Platform**: https://cf.avolut.com
- **Repository**: https://github.com/your-repo/VideoMixPro

---

## Notes

- Always test locally before deploying to production
- Keep this checklist updated with lessons learned
- Document any deployment-specific issues for future reference
- Maintain backup strategy for quick recovery

---

**Last Updated**: 2025-10-05
**Next Review**: After each deployment
