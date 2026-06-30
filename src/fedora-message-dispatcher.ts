import { Stack } from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { Construct } from 'constructs';
import * as fs from 'fs';
import * as path from 'path';

export interface FedoraMessageDispatcherInstanceProps {
  vpc: ec2.IVpc;
  amiId: string;
  instanceType?: ec2.InstanceType;
}

export class FedoraMessageDispatcherInstance extends Construct {
  public readonly instance: ec2.Instance;

  constructor(scope: Construct, id: string, props: FedoraMessageDispatcherInstanceProps) {
    super(scope, id);

    const script = fs.readFileSync(
      path.join(__dirname, '../../files/scripts/fedora-message-dispatcher.sh'),
      'utf8',
    );
    const userData = ec2.UserData.custom(script);

    this.instance = new ec2.Instance(this, 'Instance', {
      vpc: props.vpc,
      instanceType: props.instanceType ?? ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.MICRO),
      machineImage: ec2.MachineImage.genericLinux({
        [Stack.of(this).region]: props.amiId,
      }),
      userData,
    });
  }
}
