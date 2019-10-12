"use strict"

import tl = require("azure-pipelines-task-lib/task");
import toolLib = require("azure-pipelines-tool-lib/tool");
import * as path from 'path';
import fs = require('fs');
import webclient = require("azure-arm-rest-v2/webClient");
import * as os from "os";
import * as util from "util";

const buildctlToolName = "buildctl"
const uuidV4 = require('uuid/v4');
const buildctlLatestReleaseUrl = "https://api.github.com/repos/moby/buildkit/releases/latest";
const stableBuildctlVersion = "v0.5.1"
const serviceidentifier = "k8loadbalancer"
var namespace = "azuredevops"
var port = "8082"
var clusteruri = ""

export async function getStableBuildctlVersion(): Promise<string> {
    var request = new webclient.WebRequest();
    request.uri = buildctlLatestReleaseUrl;
    request.method = "GET";

    try {
        var response = await webclient.sendRequest(request);
        return response.body["tag_name"];
    } catch (error) {
        tl.warning(tl.loc("BuildctlLatestNotKnown", buildctlLatestReleaseUrl, error, stableBuildctlVersion));
    }

    return stableBuildctlVersion;
}
export async function downloadBuildctl(version: string): Promise<string> {

    let buildctlDownloadPath: string = null;
    var cachedToolpath = toolLib.findLocalTool(buildctlToolName, version);
    
    if (!cachedToolpath) {
        try {
            buildctlDownloadPath = await toolLib.downloadTool(getBuildctlDownloadURL(version), buildctlToolName + "-" + version + "-" + uuidV4() + getArchiveExtension());
        } catch (exception) {
            throw new Error(tl.loc("BuildctlDownloadFailed", getBuildctlDownloadURL(version), exception));
        }

        var unzipedBuildctlPath = await toolLib.extractTar(buildctlDownloadPath);
        unzipedBuildctlPath = path.join(unzipedBuildctlPath, "bin", buildctlToolName);
        
        tl.debug('Extracting archive: ' + unzipedBuildctlPath+' download path: '+buildctlDownloadPath);
        
        var cachedToolpath = await toolLib.cacheFile(unzipedBuildctlPath, buildctlToolName, buildctlToolName, version);
        
        tl.debug('CachedTool path: ' + cachedToolpath);    
    }

    var buildctlpath = findBuildctl(cachedToolpath);
    if (!buildctlpath) {
        throw new Error(tl.loc("BuildctlNotFoundInFolder", cachedToolpath))
    }
    
    tl.debug('Buildctl path: ' + buildctlpath);
    
    fs.chmodSync(buildctlpath, "777");
    return buildctlpath;
}

function getBuildctlDownloadURL(version: string): string {
    switch (os.type()) {
        case 'Windows_NT':
            return util.format("https://github.com/moby/buildkit/releases/download/%s/buildkit-%s.windows-amd64.tar.gz", version, version);

        case 'Darwin':
            return util.format("https://github.com/moby/buildkit/releases/download/%s/buildkit-%s.darwin-amd64.tar.gz", version, version);

        default:
            case 'Linux':
                return util.format("https://github.com/moby/buildkit/releases/download/%s/buildkit-%s.linux-amd64.tar.gz", version, version);

    }
}

export async function getServiceDetails() {

    var kubectlToolPath = tl.which("kubectl", true);
    var kubectlTool = tl.tool(kubectlToolPath);
    
    kubectlTool.arg('get');
    kubectlTool.arg('service');
    kubectlTool.arg(`--selector=identifier=${serviceidentifier}`);
    kubectlTool.arg('-o=json');

    var serviceResponse= kubectlTool.execSync();

    namespace = JSON.parse(serviceResponse.stdout).items[0].metadata.namespace;
    port = JSON.parse(serviceResponse.stdout).items[0].spec.ports[0].port;
    clusteruri = JSON.parse(serviceResponse.stdout).items[0].status.loadBalancer.ingress[0].ip;
}

export async function getBuildKitPod() {

    await getServiceDetails();

    let request = new webclient.WebRequest();
    let headers = {
        "key": tl.getVariable('Build.Repository.Name')+tl.getInput("dockerFile", true)
    };
    let webRequestOptions:webclient.WebRequestOptions = {retriableErrorCodes: [], retriableStatusCodes: [], retryCount: 1, retryIntervalInSeconds: 5, retryRequestTimedout: true};

    request.uri = `http://${clusteruri}:${port}/getBuildPod`;
    request.headers = headers
    request.method = "GET";

    var response = await webclient.sendRequest(request, webRequestOptions);
    var podname = response.body.Message;

    tl.debug("Podname " +podname);

    // set the environment variable
    process.env["BUILDKIT_HOST"] = "kube-pod://"+podname+"?namespace="+namespace;
}

function findBuildctl(rootFolder: string) {

    var BuildctlPath = path.join(rootFolder,  buildctlToolName);
    var allPaths = tl.find(rootFolder);
    var matchingResultsFiles = tl.match(allPaths, BuildctlPath, rootFolder);

    tl.debug('inside findBuildctl path: ' + BuildctlPath);   
    
    return matchingResultsFiles[0];
}

function getArchiveExtension(): string {
    if(os.type() == 'Windows_NT') {
        return ".zip";
    }
    return ".tar.gz";
}