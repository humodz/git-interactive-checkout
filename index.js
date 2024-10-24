#!/usr/bin/env node

import inquirer from 'inquirer';
import autocomplete from 'inquirer-autocomplete-prompt';
import Fuse from 'fuse.js';
import { spawn } from 'node:child_process';


async function main() {
	inquirer.registerPrompt('autocomplete', autocomplete);
	const branches = await listBranches();

	if (branches.total === 0) {
		console.log('No branches to check out');
		return;
	}

	const fuse = {
		local: new Fuse(branches.local),
		remoteOnly: new Fuse(branches.remoteOnly),
	};

	const answers = await inquirer.prompt([
		{
			type: 'autocomplete',
			name: 'branch',
			message: 'Choose a branch:',
			pageSize: 20,
			source(_, input) {
				function search(branches, fuse) {
					if (!input) {
						return branches;
					} else {
						return fuse.search(input).map(it => it.item);
					}
				}

				return [
					new inquirer.Separator('────── Available locally ──────'),
					...search(branches.local, fuse.local),
					new inquirer.Separator('───── Available on remote ─────'),
					...search(branches.remoteOnly, fuse.remoteOnly),
				];
			}
		},
	]);

	console.log();
	await checkout(answers.branch);
}

async function listBranches() {
    const output = await runWithOutput('git', [
    	'branch',
    	'--all',
    	"--format=%(HEAD) %(refname)"
    ]);
    
    const branches = output
    	.split('\n')
    	.map(line => line.trim())
    	.filter(line => line && !line.endsWith('/HEAD'))
	    .map(line => {
	    	const fullBranchName = line.replace(/^[*]? */, '').trim();

	    	return {
	    		name: fullBranchName.replace(/^refs[/](heads|remotes[/][^/]+)[/]/, ''),
	    		checkedOut: line.startsWith('*'),
	    		isRemote: fullBranchName.startsWith('refs/remotes/'),
	    	};
	    });

	const checkedOutBranch = branches.find(it => it.checkedOut)?.name ?? null;

	const localBranches = uniqueSortedNames(branches.filter(it => !it.isRemote));

	const remoteOnlyBranches = uniqueSortedNames(
		branches.filter(it => it.isRemote && !localBranches.includes(it.name))
	);


	return {
		total: localBranches.length + remoteOnlyBranches.length,
		local: localBranches,
		remoteOnly: remoteOnlyBranches,
	};
}

function uniqueSortedNames(branches) {
	return unique(branches.map(it => it.name)).sort();
}

async function checkout(branchName) {
	await run('git', ['checkout', branchName]);
}

async function runWithOutput(command, args) {
	return await run(command, args, { withOutput: true });
}

function run(command, args, { withOutput = false } = {} ) {
    return new Promise((resolve, reject) => {
        const child = spawn(command, args, {
            stdio: withOutput ? undefined : 'inherit',
        });

        let data = [];

        if (withOutput) {
	       	child.stderr.pipe(process.stderr);
	        child.stdout.on('data', (chunk) => data.push(chunk));
        }

        child.on('close', (exitCode) => {
            if (exitCode === 0) {
            	if (withOutput) {
            		resolve(data.join(''));
            	} else {
                	resolve();            		
            	}
            } else {
                reject(
                    new Error(`${command} failed with exit code ${exitCode}`),
                );
            }
        });
    });
}

function unique(items) {
	return [...new Set(items)];
}

main().catch(console.error);