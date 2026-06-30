import { App, Stack, StackProps } from 'aws-cdk-lib';
import * as wafv2 from 'aws-cdk-lib/aws-wafv2';

export class GlobalStack extends Stack {
  public readonly webAclArn: string;

  constructor(scope: App, id: string, props?: StackProps) {
    super(scope, id, props);

    const webAcl = new wafv2.CfnWebACL(this, 'WebACL', {
      scope: 'CLOUDFRONT',
      defaultAction: { allow: {} },
      rules: [
        {
          name: 'IpRateLimit',
          priority: 0,
          action: { block: {} },
          statement: {
            rateBasedStatement: {
              limit: 1000,
              aggregateKeyType: 'IP',
            },
          },
          visibilityConfig: {
            sampledRequestsEnabled: true,
            cloudWatchMetricsEnabled: true,
            metricName: 'IpRateLimit',
          },
        },
      ],
      visibilityConfig: {
        sampledRequestsEnabled: true,
        cloudWatchMetricsEnabled: true,
        metricName: 'DnfRepositoryWebACL',
      },
    });

    this.webAclArn = webAcl.attrArn;
  }
}
