import { App } from 'aws-cdk-lib';
import { GlobalStack } from './global';
import { DnfRepositoryStack } from './dnf-repo';

const app = new App();

const globalStack = new GlobalStack(app, 'GlobalStack', {
  env: { region: 'us-east-1' },
  crossRegionReferences: true,
});

new DnfRepositoryStack(app, 'DnfRepository', {
  env: { region: 'ca-central-1' },
  wafWebAclArn: globalStack.webAclArn,
  crossRegionReferences: true,
});
