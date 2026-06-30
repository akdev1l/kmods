import { App, Stack, StackProps } from 'aws-cdk-lib';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as route53targets from 'aws-cdk-lib/aws-route53-targets';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';

interface DnfRepositoryStackProps extends StackProps {
  wafWebAclArn: string;
}

export class DnfRepositoryStack extends Stack {
    repositoryBucket: s3.Bucket;
    cfDistribution: cloudfront.Distribution;
    repoHostedZone: route53.PublicHostedZone;
    repoCertificate: acm.DnsValidatedCertificate;
    gpgSigningSecret: secretsmanager.Secret;
    rpmBuilderRole: iam.Role;
    kmodBuilderInstanceProfile: iam.InstanceProfile;

    constructor(scope: App, id: string, props: DnfRepositoryStackProps) {
      super(scope, id, props);

      const environment = this.node.tryGetContext('environment');
      const ctx = this.node.tryGetContext(environment);

      this.repositoryBucket = new s3.Bucket(this, 'DnfRepositoryStorage', {
        bucketName: ctx.repositoryBucketName,
      });

      this.repoHostedZone = new route53.PublicHostedZone(this, 'DnfRepositoryHostedZone', {
        zoneName: ctx.domainName,
      });

      this.repoCertificate = new acm.DnsValidatedCertificate(this, 'DnfRepositoryCertificate', {
        domainName: ctx.domainName,
        hostedZone: this.repoHostedZone,
        region: 'us-east-1',
      });

      this.cfDistribution = new cloudfront.Distribution(this, 'DnfRepositoryDistribution', {
        defaultBehavior: {
          origin: origins.S3BucketOrigin.withOriginAccessControl(this.repositoryBucket),
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        },
        domainNames: [ctx.domainName],
        certificate: this.repoCertificate,
        webAclId: props.wafWebAclArn,
      });

      this.gpgSigningSecret = new secretsmanager.Secret(this, 'GpgSigningSecret', {
        secretName: `${ctx.repositoryBucketName}/gpg-signing-key`,
        description: 'GPG private key and passphrase for RPM signing',
      });

      const githubOidcProvider = iam.OpenIdConnectProvider.fromOpenIdConnectProviderArn(
        this,
        'GithubOidcProvider',
        `arn:aws:iam::${this.account}:oidc-provider/token.actions.githubusercontent.com`,
      );

      this.rpmBuilderRole = new iam.Role(this, 'RpmBuilderRole', {
        roleName: `${ctx.repositoryBucketName}-rpm-builder`,
        assumedBy: new iam.WebIdentityPrincipal(githubOidcProvider.openIdConnectProviderArn, {
          StringLike: {
            'token.actions.githubusercontent.com:sub': 'repo:akdev1l/kmods:*',
          },
          StringEquals: {
            'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
          },
        }),
      });

      const kmodBuilderInstanceRole = new iam.Role(this, 'KmodBuilderInstanceRole', {
        roleName: `${ctx.repositoryBucketName}-kmod-builder`,
        assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
      });

      this.kmodBuilderInstanceProfile = new iam.InstanceProfile(this, 'KmodBuilderInstanceProfile', {
        instanceProfileName: `${ctx.repositoryBucketName}-kmod-builder`,
        role: kmodBuilderInstanceRole,
      });

      this.gpgSigningSecret.grantRead(kmodBuilderInstanceRole);
      this.repositoryBucket.grantReadWrite(kmodBuilderInstanceRole);
      kmodBuilderInstanceRole.addToPrincipalPolicy(new iam.PolicyStatement({
        actions: ['ec2:TerminateInstances'],
        resources: ['*'],
        conditions: {
          StringEquals: { 'aws:ResourceAccount': this.account },
        },
      }));

      this.rpmBuilderRole.addToPrincipalPolicy(new iam.PolicyStatement({
        actions: ['ec2:RunInstances', 'ec2:CreateTags', 'ec2:DescribeInstances'],
        resources: ['*'],
      }));
      this.rpmBuilderRole.addToPrincipalPolicy(new iam.PolicyStatement({
        actions: ['iam:PassRole'],
        resources: [kmodBuilderInstanceRole.roleArn],
      }));

      new route53.ARecord(this, 'DnfRepositoryARecord', {
        zone: this.repoHostedZone,
        target: route53.RecordTarget.fromAlias(new route53targets.CloudFrontTarget(this.cfDistribution)),
      });
    }
}
