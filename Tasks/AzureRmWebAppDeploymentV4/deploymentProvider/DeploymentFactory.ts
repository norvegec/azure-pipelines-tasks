import { TaskParameters, DeploymentType } from '../operations/TaskParameters';
import * as Constant from '../operations/Constants'
import { PublishProfileWebAppDeploymentProvider } from './PublishProfileWebAppDeploymentProvider';
import { BuiltInLinuxWebAppDeploymentProvider } from './BuiltInLinuxWebAppDeploymentProvider';
import { IWebAppDeploymentProvider } from './IWebAppDeploymentProvider';
import { WindowsWebAppWebDeployProvider } from './WindowsWebAppWebDeployProvider';
import { WindowsWebAppZipDeployProvider } from './WindowsWebAppZipDeployProvider';
import { WindowsWebAppRunFromZipProvider } from './WindowsWebAppRunFromZipProvider';
import { ContainerWebAppDeploymentProvider } from './ContainerWebAppDeploymentProvider';
import tl = require('vsts-task-lib/task');
import { Package, PackageType } from 'webdeployment-common/packageUtility';
import { WindowsWebAppWarDeployProvider } from './WindowsWebAppWarDeployProvider';

export class DeploymentFactory {
    private _taskParams: TaskParameters;
    constructor(taskParams: TaskParameters) {
        this._taskParams = taskParams;
    }

    public async GetDeploymentProvider(): Promise<IWebAppDeploymentProvider> {
        switch(this._taskParams.ConnectionType) {
            case Constant.ConnectionType.PublishProfile:
                return new PublishProfileWebAppDeploymentProvider(this._taskParams);
            case Constant.ConnectionType.AzureRM:
                if(this._taskParams.isLinuxApp) {
                    return await this._getLinuxDeploymentProvider();
                } else {
                    return await this._getWindowsDeploymentProvider()
                }
            default:
                throw new Error(tl.loc('InvalidConnectionType'));
        }
    }

    private async _getLinuxDeploymentProvider(): Promise<IWebAppDeploymentProvider> {
        if(this._taskParams.isBuiltinLinuxWebApp) {
            return new BuiltInLinuxWebAppDeploymentProvider(this._taskParams);
        } else if(this._taskParams.isContainerWebApp) {
            return new ContainerWebAppDeploymentProvider(this._taskParams);
        } else {
            throw new Error(tl.loc('InvalidImageSourceType'));
        }
    }

    private async _getWindowsDeploymentProvider(): Promise<IWebAppDeploymentProvider> {
        switch(this._taskParams.Package.getPackageType()){
            case PackageType.war:
                return new WindowsWebAppWarDeployProvider(this._taskParams);
            case PackageType.jar:
                return await this._getWindowsDeploymentProviderForZipDeployAndRunFromZipMethod();
            default:
                return await this._getWindwosDeploymentProviderForZipAndFolderPackageType();
            }
    }

    private async _getWindwosDeploymentProviderForZipAndFolderPackageType(): Promise<IWebAppDeploymentProvider> {
        if(this._taskParams.UseWebDeploy) {
            return await this._getUserSelectedDeploymentProviderForWindow();
        } else {             
            var _isMSBuildPackage = await this._taskParams.Package.isMSBuildPackage();           
            if(_isMSBuildPackage || this._taskParams.VirtualApplication) {
                return new WindowsWebAppWebDeployProvider(this._taskParams);
            } else {
                return await this._getWindowsDeploymentProviderForZipDeployAndRunFromZipMethod();
            }
        }
    }

    private async _getUserSelectedDeploymentProviderForWindow(): Promise<IWebAppDeploymentProvider> {
        switch(this._taskParams.DeploymentType){
            case DeploymentType.webDeploy:
                return new WindowsWebAppWebDeployProvider(this._taskParams);
            case DeploymentType.zipDeploy:
                return new WindowsWebAppZipDeployProvider(this._taskParams);
            case DeploymentType.runFromZip:
                return new WindowsWebAppRunFromZipProvider(this._taskParams);
        }
    }

    private async _getWindowsDeploymentProviderForZipDeployAndRunFromZipMethod(): Promise<IWebAppDeploymentProvider> {
        if(this._taskParams.ScriptType) {
            return new WindowsWebAppZipDeployProvider(this._taskParams);
        } else {
            return new WindowsWebAppRunFromZipProvider(this._taskParams);
        }
    }

}